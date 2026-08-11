import type { CrmDb } from "@/lib/crm/supabase-db";
import type { LeadSource, Sector } from "@/lib/types";

export type UpdateLeadPatch = Partial<{
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  instagram: string | null;
  value: number;
  owner_id: string | null;
  stage_id: string;
  source: LeadSource;
  sector: Sector;
}>;

export async function updateLeadDomain(
  db: CrmDb,
  leadId: string,
  patch: UpdateLeadPatch
): Promise<{ ok: true } | { error: string }> {
  const finalPatch: Record<string, unknown> = { ...patch };
  if (patch.stage_id) {
    const { data: cur } = await db
      .from("leads")
      .select("stage_id")
      .eq("id", leadId)
      .maybeSingle();
    if (cur?.stage_id !== patch.stage_id) {
      finalPatch.stage_changed_at = new Date().toISOString();
    }
  }
  const { error } = await db.from("leads").update(finalPatch).eq("id", leadId);
  if (error) return { error: error.message };
  return { ok: true };
}
