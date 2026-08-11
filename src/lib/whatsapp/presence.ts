import type { SupabaseClient } from "@supabase/supabase-js";
import { brPhoneCandidates, extractLid } from "@/lib/whatsapp/jid";

type AnyObj = Record<string, any>;

/** ChatPresence → upsert em chat_presence. */
export async function handleChatPresence(
  admin: SupabaseClient,
  event: AnyObj,
  numberId: string | null
): Promise<{ presence: string }> {
  const cands = [
    event?.SenderAlt,
    event?.RecipientAlt,
    event?.Sender,
    event?.Chat,
  ]
    .map((v) => String(v ?? ""))
    .filter(Boolean);
  const state = String(event?.State ?? "").toLowerCase();

  if (state === "composing" || state === "paused") {
    let presLeadId: string | null = null;

    const phoneJid = cands.find((j) => j.endsWith("@s.whatsapp.net"));
    if (phoneJid) {
      const digits = phoneJid.split("@")[0].split(":")[0].replace(/\D/g, "");
      const { data: lead } = await admin
        .from("leads")
        .select("id")
        .in("phone", brPhoneCandidates(digits))
        .limit(1)
        .maybeSingle();
      presLeadId = (lead as { id: string } | null)?.id ?? null;
    }

    if (!presLeadId) {
      const lid = extractLid(...cands);
      if (lid) {
        const { data: lead } = await admin
          .from("leads")
          .select("id")
          .eq("wa_lid", lid)
          .limit(1)
          .maybeSingle();
        presLeadId = (lead as { id: string } | null)?.id ?? null;
        if (!presLeadId) {
          const { resolveLidToLead } = await import(
            "@/lib/services/whatsapp/lids"
          );
          const { tokenForNumberId } = await import(
            "@/lib/services/whatsapp/numbers"
          );
          const authToken = numberId
            ? await tokenForNumberId(numberId)
            : undefined;
          presLeadId = await resolveLidToLead(admin, lid, authToken);
        }
      }
    }

    if (presLeadId) {
      await admin.from("chat_presence").upsert({
        lead_id: presLeadId,
        state,
        at: new Date().toISOString(),
      });
    }
  }
  return { presence: state };
}
