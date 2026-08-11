import type { SupabaseClient } from "@supabase/supabase-js";
import {
  reactMessage,
  revokeMessage,
  editTextMessage,
} from "@/lib/services/whatsapp/dinastia";
import { resolveLeadNumber } from "@/lib/services/whatsapp/numbers";

export async function scheduleMessageDomain(
  db: SupabaseClient,
  input: {
    leadId: string;
    body: string;
    sendAt: string;
    createdBy: string | null;
  }
): Promise<{ ok: true } | { error: string }> {
  const text = input.body.trim();
  if (!text) return { error: "Mensagem vazia." };
  if (!input.sendAt) return { error: "Escolha a data/hora do envio." };
  if (new Date(input.sendAt).getTime() <= Date.now())
    return { error: "A data/hora precisa ser no futuro." };

  const { data: lead } = await db
    .from("leads")
    .select("*")
    .eq("id", input.leadId)
    .single();
  if (!lead?.phone) return { error: "Lead sem telefone." };

  const { error } = await db.from("scheduled_messages").insert({
    lead_id: input.leadId,
    body: text,
    send_at: input.sendAt,
    created_by: input.createdBy,
  });
  if (error) return { error: error.message };
  return { ok: true };
}

export async function cancelScheduledMessageDomain(
  db: SupabaseClient,
  input: { id: string; leadId: string }
): Promise<{ ok: true } | { error: string }> {
  void input.leadId;
  const { error } = await db
    .from("scheduled_messages")
    .update({ status: "canceled" })
    .eq("id", input.id)
    .eq("status", "pending");
  if (error) return { error: error.message };
  return { ok: true };
}

export async function reactToMessageDomain(
  db: SupabaseClient,
  input: {
    leadId: string;
    messageId: string;
    direction: "in" | "out";
    emoji: string;
  }
): Promise<{ ok: true } | { error: string }> {
  const { data: lead } = await db
    .from("leads")
    .select("phone")
    .eq("id", input.leadId)
    .single();
  if (!lead?.phone) return { error: "Lead sem telefone." };

  const r = await reactMessage(
    lead.phone,
    input.messageId,
    input.emoji,
    input.direction === "out"
  );
  if (!r.ok) return { error: `Falha na reação: ${r.error}` };

  await db
    .from("whatsapp_messages")
    .update({ reaction: input.emoji || null })
    .eq("provider_msg_id", input.messageId);

  return { ok: true };
}

export async function deleteMessageForAllDomain(
  db: SupabaseClient,
  input: { leadId: string; providerMsgId: string }
): Promise<{ ok: true } | { error: string }> {
  const { data: lead } = await db
    .from("leads")
    .select("phone")
    .eq("id", input.leadId)
    .maybeSingle();
  const phone = (lead as { phone: string | null } | null)?.phone;
  if (!phone) return { error: "Lead sem telefone." };

  const { token: authToken } = await resolveLeadNumber(input.leadId);
  const r = await revokeMessage(phone, input.providerMsgId, authToken);
  if (!r.ok) return { error: r.error ?? "Falha ao apagar no WhatsApp." };

  const { error } = await db
    .from("whatsapp_messages")
    .update({
      body: "(mensagem apagada)",
      media_url: null,
      media_type: null,
      reply_to_body: null,
      reply_to_dir: null,
    })
    .eq("lead_id", input.leadId)
    .eq("provider_msg_id", input.providerMsgId);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function editWhatsappMessageDomain(
  db: SupabaseClient,
  input: { leadId: string; providerMsgId: string; newBody: string }
): Promise<{ ok: true } | { error: string }> {
  const text = input.newBody.trim();
  if (!text) return { error: "Mensagem não pode ficar vazia." };

  const { data: lead } = await db
    .from("leads")
    .select("phone")
    .eq("id", input.leadId)
    .maybeSingle();
  const phone = (lead as { phone: string | null } | null)?.phone;
  if (!phone) return { error: "Lead sem telefone." };

  const { token: authToken } = await resolveLeadNumber(input.leadId);
  const r = await editTextMessage(phone, input.providerMsgId, text, authToken);
  if (!r.ok) return { error: r.error ?? "Falha ao editar no WhatsApp." };

  const { error } = await db
    .from("whatsapp_messages")
    .update({ body: text })
    .eq("lead_id", input.leadId)
    .eq("provider_msg_id", input.providerMsgId);
  if (error) return { error: error.message };
  return { ok: true };
}
