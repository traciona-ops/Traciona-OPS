import type { SupabaseClient } from "@supabase/supabase-js";
import { getContacts, onlyDigits } from "./dinastia";

// Tratamento do nome do contato: quem chega pelo WhatsApp deve aparecer com
// o NOME (PushName da agenda), não com o número. Contato criado antes do
// nome chegar fica salvo como número — estas rotinas corrigem isso sem
// nunca sobrescrever um nome de verdade (editado à mão ou já correto).

/** O campo nome é "de verdade"? Falso quando é vazio ou só o telefone. */
export function isPhoneLikeName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  if (!n) return true;
  return /^[\d\s()+\-.]+$/.test(n) && onlyDigits(n).length >= 8;
}

/**
 * Varredura (roda no cron): busca leads com número no lugar do nome e
 * corrige usando a agenda da instância. Retorna quantos corrigiu.
 */
export async function sweepNumberNames(
  admin: SupabaseClient,
  limit = 30
): Promise<number> {
  const { data } = await admin
    .from("leads")
    .select("id,name,phone")
    .not("phone", "is", null)
    .limit(500);
  const candidates = ((data ?? []) as {
    id: string;
    name: string | null;
    phone: string | null;
  }[])
    .filter((l) => isPhoneLikeName(l.name))
    .slice(0, limit);
  if (!candidates.length) return 0;

  const book = await getContacts();
  if (!book || book.size === 0) return 0;

  let fixed = 0;
  for (const l of candidates) {
    const digits = onlyDigits(l.phone ?? "");
    if (!digits) continue;
    // casa exato; senão pelo sufixo (variações de DDI / 9º dígito)
    let name = book.get(digits) ?? null;
    if (!name && digits.length >= 8) {
      const tail = digits.slice(-8);
      for (const [k, v] of book) {
        if (k.endsWith(tail)) {
          name = v;
          break;
        }
      }
    }
    if (name && !isPhoneLikeName(name)) {
      const { error } = await admin
        .from("leads")
        .update({ name: name.trim() })
        .eq("id", l.id);
      if (!error) fixed++;
    }
  }
  return fixed;
}
