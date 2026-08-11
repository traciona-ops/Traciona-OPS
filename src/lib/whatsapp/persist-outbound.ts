import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureActiveSession } from "@/lib/chat-sessions/ensure-active-session";

export type PersistOutboundInput = {
  leadId: string;
  numberId?: string | null;
  body: string | null;
  reply_to_body?: string | null;
  reply_to_dir?: "in" | "out" | null;
  media_url?: string | null;
  media_type?: string | null;
  status: string;
  provider_msg_id: string | null;
  sent_by: string | null;
};

/** Insert direction=out em whatsapp_messages (provider dinastia). */
export async function persistOutboundMessage(
  db: SupabaseClient,
  input: PersistOutboundInput
): Promise<{ id?: string; error?: string }> {
  let sessionId: string | null = null;
  try {
    const sess = await ensureActiveSession(db, {
      leadId: input.leadId,
      numberId: input.numberId ?? null,
      direction: "out",
    });
    sessionId = sess.sessionId;
  } catch {
    // sessão nunca bloqueia o envio
  }

  const row: Record<string, unknown> = {
    lead_id: input.leadId,
    direction: "out",
    body: input.body,
    reply_to_body: input.reply_to_body ?? null,
    reply_to_dir: input.reply_to_dir ?? null,
    media_url: input.media_url ?? null,
    media_type: input.media_type ?? null,
    status: input.status,
    provider: "dinastia",
    provider_msg_id: input.provider_msg_id,
    sent_by: input.sent_by,
    session_id: sessionId,
  };
  if (input.numberId !== undefined) row.number_id = input.numberId;

  const { data, error } = await db
    .from("whatsapp_messages")
    .insert(row)
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: (data as { id?: string } | null)?.id };
}

export async function touchLastContact(
  db: SupabaseClient,
  leadId: string
): Promise<void> {
  await db
    .from("leads")
    .update({ last_contact_at: new Date().toISOString() })
    .eq("id", leadId);
}
