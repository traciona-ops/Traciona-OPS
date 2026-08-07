import type { SupabaseClient } from "@supabase/supabase-js";
import { getAvatar } from "./dinastia";

// Busca automática da foto de perfil do WhatsApp.
// Regras de frescor (pra não martelar a instância a cada mensagem):
//   * lead SEM foto  → tenta de novo no máximo a cada 6 horas
//   * lead COM foto  → revisa 1x por semana (a pessoa pode trocar a foto)

const RETRY_NULL_MS = 6 * 3600_000;
const REFRESH_MS = 7 * 24 * 3600_000;

export interface AvatarLead {
  id: string;
  phone: string | null;
  avatar_url: string | null;
  avatar_id: string | null;
  avatar_checked_at: string | null;
}

function isDue(lead: AvatarLead): boolean {
  if (!lead.phone) return false;
  if (!lead.avatar_checked_at) return true;
  const age = Date.now() - new Date(lead.avatar_checked_at).getTime();
  return age > (lead.avatar_url ? REFRESH_MS : RETRY_NULL_MS);
}

/**
 * Puxa a foto do WhatsApp e grava no lead (bucket `avatars`).
 * Respeita o frescor; nunca lança — retorna true só se ATUALIZOU a foto.
 */
export async function ensureLeadAvatar(
  admin: SupabaseClient,
  lead: AvatarLead,
  opts: { force?: boolean } = {}
): Promise<boolean> {
  try {
    if (!lead.phone) return false;
    if (!opts.force && !isDue(lead)) return false;

    // carimba a tentativa ANTES (mesmo falhando, não re-tenta já no próximo tick)
    await admin
      .from("leads")
      .update({ avatar_checked_at: new Date().toISOString() })
      .eq("id", lead.id);

    const av = await getAvatar(lead.phone);
    if (!av) return false;
    if (lead.avatar_id && av.id && lead.avatar_id === av.id) return false;

    // av.base64 é um data URI "data:image/jpeg;base64,...."
    const comma = av.base64.indexOf(",");
    const buf = Buffer.from(av.base64.slice(comma + 1), "base64");
    const path = `${lead.id}.jpg`;
    const { error: upErr } = await admin.storage
      .from("avatars")
      .upload(path, buf, { contentType: "image/jpeg", upsert: true });
    if (upErr) return false;

    const publicUrl = admin.storage.from("avatars").getPublicUrl(path).data
      .publicUrl;
    const finalUrl = `${publicUrl}?v=${av.id ?? Date.now()}`;
    await admin
      .from("leads")
      .update({ avatar_url: finalUrl, avatar_id: av.id })
      .eq("id", lead.id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Varredura do cron: prioriza quem está SEM foto, depois revisa fotos antigas.
 * Retorna quantas fotos atualizou.
 */
export async function sweepAvatars(
  admin: SupabaseClient,
  budget = 8
): Promise<number> {
  let updated = 0;

  // 1) sem foto (nunca tentados primeiro)
  const { data: missing } = await admin
    .from("leads")
    .select("id, phone, avatar_url, avatar_id, avatar_checked_at")
    .not("phone", "is", null)
    .is("avatar_url", null)
    .or(
      `avatar_checked_at.is.null,avatar_checked_at.lt.${new Date(
        Date.now() - RETRY_NULL_MS
      ).toISOString()}`
    )
    .order("avatar_checked_at", { ascending: true, nullsFirst: true })
    .limit(budget);

  for (const l of (missing ?? []) as AvatarLead[]) {
    if (await ensureLeadAvatar(admin, l)) updated++;
  }

  // 2) sobrou orçamento → revisa fotos com mais de 7 dias
  const rest = budget - (missing?.length ?? 0);
  if (rest > 0) {
    const { data: stale } = await admin
      .from("leads")
      .select("id, phone, avatar_url, avatar_id, avatar_checked_at")
      .not("phone", "is", null)
      .not("avatar_url", "is", null)
      .lt(
        "avatar_checked_at",
        new Date(Date.now() - REFRESH_MS).toISOString()
      )
      .order("avatar_checked_at", { ascending: true })
      .limit(rest);
    for (const l of (stale ?? []) as AvatarLead[]) {
      if (await ensureLeadAvatar(admin, l)) updated++;
    }
  }

  return updated;
}
