import type { SupabaseClient } from "@supabase/supabase-js";

type AnyObj = Record<string, any>;

/** Reação inbound → atualiza reaction na mensagem alvo. */
export async function handleInboundReaction(
  admin: SupabaseClient,
  msg: AnyObj
): Promise<boolean> {
  if (!msg.reactionMessage) return false;
  const targetId =
    msg.reactionMessage?.key?.id ?? msg.reactionMessage?.key?.ID ?? null;
  const emoji = msg.reactionMessage?.text ?? "";
  if (targetId) {
    await admin
      .from("whatsapp_messages")
      .update({ reaction: emoji || null })
      .eq("provider_msg_id", targetId);
  }
  return true;
}
