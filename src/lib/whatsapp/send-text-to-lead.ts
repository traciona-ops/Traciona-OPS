import type { SupabaseClient } from "@supabase/supabase-js";
import { sendText } from "@/lib/services/whatsapp/dinastia";
import { resolveLeadNumber } from "@/lib/services/whatsapp/numbers";
import { applyMessageSignature } from "@/lib/whatsapp/signature";
import {
  persistOutboundMessage,
  touchLastContact,
} from "@/lib/whatsapp/persist-outbound";

export type SendTextToLeadOpts = {
  leadId: string;
  body: string;
  sentBy?: string | null;
  /** Aplica assinatura do perfil (default true se sentBy). */
  withSignature?: boolean;
  replyTo?: {
    providerMsgId: string | null;
    body: string | null;
    direction: "in" | "out";
  };
};

/**
 * Envia texto ao lead via DinastiAPI e grava em whatsapp_messages.
 * Usado por actions do chat e por outros domínios (contratos, etc.) —
 * sem importar Server Actions.
 */
export async function sendTextToLead(
  db: SupabaseClient,
  opts: SendTextToLeadOpts
): Promise<{ ok: true } | { error: string }> {
  let text = opts.body.trim();
  if (!text) return { error: "Mensagem vazia." };

  const { data: lead } = await db
    .from("leads")
    .select("phone")
    .eq("id", opts.leadId)
    .single();
  if (!lead?.phone) return { error: "Lead sem telefone." };

  const withSig = opts.withSignature ?? !!opts.sentBy;
  if (withSig) {
    text = await applyMessageSignature(db, opts.sentBy, text);
  }

  const { numberId, token: authToken } = await resolveLeadNumber(opts.leadId);
  const result = await sendText(
    lead.phone as string,
    text,
    authToken,
    opts.replyTo?.providerMsgId
      ? {
          stanzaId: opts.replyTo.providerMsgId,
          fromMe: opts.replyTo.direction === "out",
        }
      : undefined
  );

  const { error: insErr } = await persistOutboundMessage(db, {
    leadId: opts.leadId,
    numberId,
    body: text,
    reply_to_body: opts.replyTo
      ? (opts.replyTo.body ?? "[mídia]").slice(0, 180)
      : null,
    reply_to_dir: opts.replyTo?.direction ?? null,
    status: result.ok ? "sent" : "failed",
    provider_msg_id: result.ok ? result.id : null,
    sent_by: opts.sentBy ?? null,
  });
  if (insErr) return { error: insErr };

  if (result.ok) await touchLastContact(db, opts.leadId);
  return result.ok
    ? { ok: true }
    : { error: `Falha no envio: ${result.error}` };
}
