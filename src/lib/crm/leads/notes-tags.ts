import type { CrmDb } from "@/lib/crm/supabase-db";

export async function addNoteDomain(
  db: CrmDb,
  input: { leadId: string; content: string; authorId: string | null }
): Promise<{ ok: true } | { error: string }> {
  const { error } = await db.from("lead_notes").insert({
    lead_id: input.leadId,
    author_id: input.authorId,
    content: input.content,
  });
  if (error) return { error: error.message };

  await db
    .from("leads")
    .update({ last_contact_at: new Date().toISOString() })
    .eq("id", input.leadId);

  return { ok: true };
}

export async function addTagDomain(
  db: CrmDb,
  input: { leadId: string; tag: string; color: string }
): Promise<{ ok: true } | { error: string }> {
  const { error } = await db
    .from("lead_tags")
    .insert({ lead_id: input.leadId, tag: input.tag, color: input.color });
  if (error) return { error: error.message };
  return { ok: true };
}

export async function removeTagDomain(
  db: CrmDb,
  input: { tagId: string; leadId: string }
): Promise<{ ok: true } | { error: string }> {
  const { error } = await db.from("lead_tags").delete().eq("id", input.tagId);
  if (error) return { error: error.message };
  return { ok: true };
}
