import type { CrmDb } from "@/lib/crm/supabase-db";

export async function deleteLeadDomain(
  db: CrmDb,
  leadId: string
): Promise<{ ok: true; detached?: true } | { error: string }> {
  const { count } = await db
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId);

  if ((count ?? 0) > 0) {
    const { error } = await db
      .from("leads")
      .update({ pipeline_id: null, stage_id: null })
      .eq("id", leadId);
    if (error) return { error: error.message };
    return { ok: true, detached: true };
  }

  const { error } = await db.from("leads").delete().eq("id", leadId);
  if (error) return { error: error.message };
  return { ok: true };
}
