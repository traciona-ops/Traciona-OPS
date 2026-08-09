import type { SupabaseClient } from "@supabase/supabase-js";
import { getContactsRaw, onlyDigits } from "./dinastia";

// O WhatsApp esconde o telefone de quem interage atrás de um id de
// privacidade (@lid) — e o evento de "digitando" chega SÓ com ele. Um lead
// sem wa_lid preenchido fica invisível pro indicador até mandar a primeira
// mensagem. Estas rotinas aprendem o lid ANTES disso, cruzando a agenda:
// o mesmo contato aparece nas duas formas (telefone e lid) com o mesmo
// PushName. Só cruza quando o nome é único dos dois lados.

/** Mapa lid → dígitos do telefone, via PushName único na agenda. */
export async function buildLidPhoneMap(
  authToken?: string
): Promise<Map<string, string>> {
  const raw = await getContactsRaw(authToken);
  const map = new Map<string, string>();
  if (!raw) return map;
  // nome → id (null = nome repetido, ambíguo)
  const phoneByName = new Map<string, string | null>();
  const lidByName = new Map<string, string | null>();
  for (const [jid, c] of Object.entries(raw)) {
    const name = String(c?.PushName ?? "").trim();
    if (!name) continue;
    const id = jid.split("@")[0].split(":")[0];
    if (jid.endsWith("@s.whatsapp.net")) {
      phoneByName.set(name, phoneByName.has(name) ? null : id);
    } else if (jid.endsWith("@lid")) {
      lidByName.set(name, lidByName.has(name) ? null : id);
    }
  }
  for (const [name, lid] of lidByName) {
    const phone = phoneByName.get(name);
    if (lid && phone) map.set(lid, onlyDigits(phone));
  }
  return map;
}

/**
 * Resolve um lid desconhecido na hora (webhook de presença): cruza a agenda,
 * acha o lead pelo telefone e persiste o wa_lid. Retorna o id do lead ou null.
 */
export async function resolveLidToLead(
  admin: SupabaseClient,
  lid: string,
  authToken?: string
): Promise<string | null> {
  const phone = (await buildLidPhoneMap(authToken)).get(lid);
  if (!phone || phone.length < 8) return null;
  // sufixo de 8 dígitos absorve variações de DDI e do 9º dígito BR
  const { data: lead } = await admin
    .from("leads")
    .select("id")
    .like("phone", `%${phone.slice(-8)}`)
    .limit(1)
    .maybeSingle();
  const leadId = (lead as { id: string } | null)?.id ?? null;
  if (leadId) {
    await admin
      .from("leads")
      .update({ wa_lid: lid })
      .eq("id", leadId)
      .is("wa_lid", null);
  }
  return leadId;
}

/**
 * Varredura (roda no cron): preenche o wa_lid dos leads que ainda não têm,
 * cruzando a agenda. Retorna quantos aprendeu.
 */
export async function sweepLids(
  admin: SupabaseClient,
  limit = 500
): Promise<number> {
  const { data } = await admin
    .from("leads")
    .select("id,phone")
    .is("wa_lid", null)
    .not("phone", "is", null)
    .limit(limit);
  const leads = (data ?? []) as { id: string; phone: string | null }[];
  if (!leads.length) return 0;

  const lidToPhone = await buildLidPhoneMap();
  if (!lidToPhone.size) return 0;
  // sufixo do telefone → lid (null = colisão, ignora)
  const byTail = new Map<string, string | null>();
  for (const [lid, ph] of lidToPhone) {
    if (ph.length < 8) continue;
    const tail = ph.slice(-8);
    byTail.set(tail, byTail.has(tail) ? null : lid);
  }

  let learned = 0;
  for (const l of leads) {
    const digits = onlyDigits(l.phone ?? "");
    if (digits.length < 8) continue;
    const lid = byTail.get(digits.slice(-8));
    if (!lid) continue;
    const { error } = await admin
      .from("leads")
      .update({ wa_lid: lid })
      .eq("id", l.id)
      .is("wa_lid", null);
    if (!error) learned++;
  }
  return learned;
}
