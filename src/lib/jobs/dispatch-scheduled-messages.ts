import type { SupabaseClient } from "@supabase/supabase-js";
import { sendText } from "@/lib/services/whatsapp/dinastia";

type DueRow = {
  id: string;
  body: string;
  created_by: string | null;
  attempts: number;
  lead: { id: string; name: string; phone: string | null } | null;
};

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5 * 60_000;
const STUCK_AFTER_MS = 10 * 60_000;

export type DispatchScheduledResult = {
  processed: number;
  sent: number;
  failed: number;
};

/**
 * Resgata mensagens presas em `processing`, claim atômico das vencidas e envia.
 * Dois ticks sobrepostos nunca pegam a mesma linha.
 */
export async function dispatchScheduledMessages(
  admin: SupabaseClient
): Promise<DispatchScheduledResult> {
  const nowISO = new Date().toISOString();

  await admin
    .from("scheduled_messages")
    .update({ status: "pending" })
    .eq("status", "processing")
    .lt("claimed_at", new Date(Date.now() - STUCK_AFTER_MS).toISOString());

  const { data: claimed } = await admin
    .from("scheduled_messages")
    .update({ status: "processing", claimed_at: nowISO })
    .eq("status", "pending")
    .lte("send_at", nowISO)
    .select("id, body, created_by, attempts, lead:leads(id,name,phone)");

  let sent = 0;
  let failed = 0;
  const rows = (claimed ?? []) as unknown as DueRow[];

  for (const row of rows) {
    const phone = row.lead?.phone;
    if (!phone) {
      await admin
        .from("scheduled_messages")
        .update({ status: "failed", error: "Lead sem telefone." })
        .eq("id", row.id);
      failed++;
      continue;
    }

    const result = await sendText(phone, row.body);

    if (result.ok) {
      const { persistOutboundMessage, touchLastContact } = await import(
        "@/lib/whatsapp/persist-outbound"
      );
      const inserted = await persistOutboundMessage(admin, {
        leadId: row.lead!.id,
        body: row.body,
        status: "sent",
        provider_msg_id: result.id,
        sent_by: row.created_by,
      });

      await admin
        .from("scheduled_messages")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          error: null,
          sent_message_id: inserted.id ?? null,
        })
        .eq("id", row.id);

      await touchLastContact(admin, row.lead!.id);
      sent++;
    } else if ((row.attempts ?? 0) + 1 < MAX_ATTEMPTS) {
      await admin
        .from("scheduled_messages")
        .update({
          status: "pending",
          attempts: (row.attempts ?? 0) + 1,
          send_at: new Date(Date.now() + RETRY_DELAY_MS).toISOString(),
          error: result.error,
        })
        .eq("id", row.id);
      failed++;
    } else {
      await admin
        .from("scheduled_messages")
        .update({
          status: "failed",
          sent_at: new Date().toISOString(),
          error: result.error,
        })
        .eq("id", row.id);
      failed++;
    }
  }

  return { processed: rows.length, sent, failed };
}
