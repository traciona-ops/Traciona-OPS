import type { CrmDb } from "@/lib/crm/supabase-db";

export async function moveLeadDomain(
  db: CrmDb,
  input: { leadId: string; toStageId: string; orderedIds: string[] }
): Promise<{ ok: true } | { error: string }> {
  // SLA: stage_changed_at só muda quando o card TROCA de etapa. Reordenar
  // dentro da mesma coluna não pode zerar o cronômetro "parado há X dias".
  const [{ data: cur }, { data: destStage }] = await Promise.all([
    db.from("leads").select("stage_id").eq("id", input.leadId).maybeSingle(),
    db
      .from("pipeline_stages")
      .select("pipeline_id")
      .eq("id", input.toStageId)
      .maybeSingle(),
  ]);
  const changedStage = cur?.stage_id !== input.toStageId;

  const patch: Record<string, unknown> = { stage_id: input.toStageId };
  if (destStage?.pipeline_id) patch.pipeline_id = destStage.pipeline_id;
  if (changedStage) patch.stage_changed_at = new Date().toISOString();

  const { error } = await db.from("leads").update(patch).eq("id", input.leadId);
  if (error) return { error: error.message };

  const { error: reErr } = await db.rpc("reorder_leads", {
    p_ids: input.orderedIds,
  });
  if (reErr) return { error: reErr.message };

  return { ok: true };
}

export async function moveAllLeadsDomain(
  db: CrmDb,
  input: { fromStageId: string; toStageId: string }
): Promise<{ ok: true } | { error: string }> {
  if (!input.toStageId || input.fromStageId === input.toStageId) {
    return { error: "Escolha uma etapa de destino diferente." };
  }

  const { error } = await db
    .from("leads")
    .update({
      stage_id: input.toStageId,
      stage_changed_at: new Date().toISOString(),
    })
    .eq("stage_id", input.fromStageId);
  if (error) return { error: error.message };
  return { ok: true };
}
