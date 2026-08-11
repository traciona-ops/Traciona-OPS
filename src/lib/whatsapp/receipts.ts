import type { SupabaseClient } from "@supabase/supabase-js";
import { extractLid } from "@/lib/whatsapp/jid";

type AnyObj = Record<string, any>;

/** ReadReceipt → status delivered/read + aprende wa_lid. */
export async function handleReadReceipt(
  admin: SupabaseClient,
  payload: AnyObj,
  event: AnyObj
): Promise<{ handled: true; receipt: string } | { handled: false }> {
  const ids: string[] =
    payload?.data?.event?.MessageIDs ?? event?.MessageIDs ?? [];
  const t = String(
    payload?.data?.event?.Type ?? payload?.data?.state ?? ""
  ).toLowerCase();
  if (!ids.length || !(t.includes("read") || t.includes("deliver"))) {
    return { handled: true, receipt: t };
  }

  if (t.includes("read")) {
    await admin
      .from("whatsapp_messages")
      .update({ status: "read" })
      .in("provider_msg_id", ids)
      .neq("status", "read");
  } else {
    await admin
      .from("whatsapp_messages")
      .update({ status: "delivered" })
      .in("provider_msg_id", ids)
      .eq("status", "sent");
  }

  const receiptLid = extractLid(event?.Sender, event?.SenderAlt, event?.Chat);
  if (receiptLid) {
    const { data: row } = await admin
      .from("whatsapp_messages")
      .select("lead_id")
      .in("provider_msg_id", ids)
      .eq("direction", "out")
      .limit(1)
      .maybeSingle();
    const leadId = (row as { lead_id: string } | null)?.lead_id;
    if (leadId) {
      await admin
        .from("leads")
        .update({ wa_lid: receiptLid })
        .eq("id", leadId)
        .is("wa_lid", null);
    }
  }
  return { handled: true, receipt: t };
}
