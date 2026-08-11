import type { SupabaseClient } from "@supabase/supabase-js";
import { isPhoneLikeName } from "@/lib/services/whatsapp/names";
import { extractLid } from "@/lib/whatsapp/jid";

export async function findOrCreateWaLead(
  admin: SupabaseClient,
  phone: string,
  name: string
): Promise<{ leadId: string } | { error: string }> {
  const { data: leadId, error } = await admin.rpc("wa_find_or_create_lead", {
    p_phone: phone,
    p_name: name,
    p_sector: "vendas",
  });
  if (error || !leadId) return { error: error?.message ?? "lead-resolve-failed" };
  return { leadId: leadId as string };
}

/** Aprende wa_lid e corrige nome se ainda for telefone-like. */
export async function enrichLeadFromInbound(
  admin: SupabaseClient,
  leadId: string,
  opts: {
    pushName: string;
    fromMe: boolean;
    info: Record<string, unknown>;
  }
) {
  const { pushName, fromMe, info } = opts;
  if (!fromMe) {
    const lid = extractLid(
      info.Chat as string,
      info.Sender as string
    );
    if (lid) {
      await admin
        .from("leads")
        .update({ wa_lid: lid })
        .eq("id", leadId)
        .or(`wa_lid.is.null,wa_lid.neq.${lid}`);
    }
  }

  if (pushName && !isPhoneLikeName(pushName)) {
    const { data: cur } = await admin
      .from("leads")
      .select("name")
      .eq("id", leadId)
      .maybeSingle();
    const curName = String((cur as { name?: string } | null)?.name ?? "").trim();
    if (isPhoneLikeName(curName) && curName !== pushName) {
      await admin.from("leads").update({ name: pushName }).eq("id", leadId);
    }
  }
}
