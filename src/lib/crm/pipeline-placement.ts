import type { CrmDb } from "@/lib/crm/supabase-db";

/** Funil comercial padrão: não arquivado, não CS, preferência por `is_default`. */
export async function findDefaultCommercialPipeline(db: CrmDb) {
  const { data } = await db
    .from("pipelines")
    .select("id")
    .eq("archived", false)
    .eq("is_cs", false)
    .order("is_default", { ascending: false })
    .order("position")
    .limit(1)
    .maybeSingle();
  return data;
}

export async function firstStageOfPipeline(db: CrmDb, pipelineId: string) {
  const { data } = await db
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_id", pipelineId)
    .order("position")
    .limit(1)
    .maybeSingle();
  return data;
}

/** Menor `position` na etapa — novo card vai pro topo (ordem ASC). */
export async function topPositionInStage(db: CrmDb, stageId: string) {
  const { data: top } = await db
    .from("leads")
    .select("position")
    .eq("stage_id", stageId)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  return top ? top.position - 1 : 0;
}

export type PlaceInDefaultPipelineResult =
  | { ok: true; placed: true }
  | { ok: true; placed: false; reason: "already_in_pipeline" | "no_pipeline" | "no_stage" }
  | { ok: false; error: string };

/**
 * Coloca o lead no topo da 1ª etapa do funil comercial padrão.
 * Usado pelo webhook (auto-card), chat e promoção contato → negócio.
 */
export async function placeLeadInDefaultPipeline(
  db: CrmDb,
  leadId: string,
  opts?: { skipIfHasPipeline?: boolean }
): Promise<PlaceInDefaultPipelineResult> {
  const skipIfHasPipeline = opts?.skipIfHasPipeline ?? true;

  if (skipIfHasPipeline) {
    const { data: lead } = await db
      .from("leads")
      .select("pipeline_id")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead) return { ok: false, error: "Lead não encontrado." };
    if (lead.pipeline_id) return { ok: true, placed: false, reason: "already_in_pipeline" };
  }

  const pipeline = await findDefaultCommercialPipeline(db);
  if (!pipeline) return { ok: true, placed: false, reason: "no_pipeline" };

  const stage = await firstStageOfPipeline(db, pipeline.id);
  if (!stage) return { ok: true, placed: false, reason: "no_stage" };

  const position = await topPositionInStage(db, stage.id);
  const { error } = await db
    .from("leads")
    .update({
      pipeline_id: pipeline.id,
      stage_id: stage.id,
      stage_changed_at: new Date().toISOString(),
      position,
    })
    .eq("id", leadId);

  if (error) return { ok: false, error: error.message };
  return { ok: true, placed: true };
}
