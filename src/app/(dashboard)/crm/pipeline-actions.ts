"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/permissions";
import { slugify } from "@/lib/utils/slug";
import { db, ensure } from "./_helpers";

export async function createStage(pipelineId: string, name: string) {
  const denied = await ensure(can.configurePipelines);
  if (denied) return denied;
  const supabase = await db();
  const { data: max } = await supabase
    .from("pipeline_stages")
    .select("position")
    .eq("pipeline_id", pipelineId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const stageName = name || "Nova etapa";
  const base = slugify(stageName) || "etapa";
  let code = base;
  for (let i = 1; i < 100; i++) {
    const { data: clash } = await supabase
      .from("pipeline_stages")
      .select("id")
      .eq("pipeline_id", pipelineId)
      .eq("code", code)
      .maybeSingle();
    if (!clash) break;
    code = `${base}-${i + 1}`;
  }

  const { error } = await supabase.from("pipeline_stages").insert({
    pipeline_id: pipelineId,
    name: stageName,
    code,
    position: (max?.position ?? -1) + 1,
    color: "#8b9bb4",
    sla_days: 3,
  });
  if (error) return { error: error.message };
  revalidatePath("/crm");
  return { ok: true };
}

export async function updateStage(
  stageId: string,
  patch: Partial<{
    name: string;
    color: string;
    sla_days: number | null;
    is_won: boolean;
    is_lost: boolean;
  }>
) {
  const denied = await ensure(can.configurePipelines);
  if (denied) return denied;
  const supabase = await db();
  const { error } = await supabase
    .from("pipeline_stages")
    .update(patch)
    .eq("id", stageId);
  if (error) return { error: error.message };
  revalidatePath("/crm");
  return { ok: true };
}

export async function deleteStage(stageId: string) {
  const denied = await ensure(can.configurePipelines);
  if (denied) return denied;
  const supabase = await db();
  const { count } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", stageId);
  if ((count ?? 0) > 0) {
    return { error: "Mova os leads desta etapa antes de excluí-la." };
  }
  const { error } = await supabase
    .from("pipeline_stages")
    .delete()
    .eq("id", stageId);
  if (error) return { error: error.message };
  revalidatePath("/crm");
  return { ok: true };
}

export async function reorderStages(orderedIds: string[]) {
  const denied = await ensure(can.configurePipelines);
  if (denied) return denied;
  const supabase = await db();
  await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from("pipeline_stages").update({ position: i }).eq("id", id)
    )
  );
  revalidatePath("/crm");
  return { ok: true };
}

export async function createPipeline(name: string) {
  const denied = await ensure(can.configurePipelines);
  if (denied) return denied;
  const supabase = await db();
  const { data: max } = await supabase
    .from("pipelines")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const pipelineName = name || "Novo pipeline";
  const baseP = slugify(pipelineName) || "pipeline";
  let pCode = baseP;
  for (let i = 1; i < 100; i++) {
    const { data: clash } = await supabase
      .from("pipelines")
      .select("id")
      .eq("code", pCode)
      .maybeSingle();
    if (!clash) break;
    pCode = `${baseP}-${i + 1}`;
  }

  const { data, error } = await supabase
    .from("pipelines")
    .insert({
      name: pipelineName,
      code: pCode,
      type: "custom",
      color: "#1d6fff",
      position: (max?.position ?? -1) + 1,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  // etapa inicial pra ser usável
  await supabase.from("pipeline_stages").insert({
    pipeline_id: data.id,
    name: "Novo Lead",
    code: "novo-lead",
    position: 0,
    color: "#8b9bb4",
    sla_days: 3,
  });

  revalidatePath("/crm");
  return { id: data.id };
}

export async function updatePipeline(
  pipelineId: string,
  patch: Partial<{ name: string; color: string }>
) {
  const denied = await ensure(can.configurePipelines);
  if (denied) return denied;
  const supabase = await db();
  const { error } = await supabase
    .from("pipelines")
    .update(patch)
    .eq("id", pipelineId);
  if (error) return { error: error.message };
  revalidatePath("/crm");
  return { ok: true };
}

export async function deletePipeline(pipelineId: string) {
  const denied = await ensure(can.configurePipelines);
  if (denied) return denied;
  const supabase = await db();
  const { count } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("pipeline_id", pipelineId);
  if ((count ?? 0) > 0) {
    return { error: "Mova ou exclua os leads deste pipeline antes." };
  }
  const { error } = await supabase
    .from("pipelines")
    .delete()
    .eq("id", pipelineId);
  if (error) return { error: error.message };
  revalidatePath("/crm");
  return { ok: true };
}

export async function updateStageSla(stageId: string, slaDays: number | null) {
  const denied = await ensure(can.configurePipelines);
  if (denied) return denied;
  const supabase = await db();
  const { error } = await supabase
    .from("pipeline_stages")
    .update({ sla_days: slaDays })
    .eq("id", stageId);
  if (error) return { error: error.message };
  revalidatePath("/crm");
  return { ok: true };
}

export async function reorderStage(input: { orderedIds: string[] }) {
  const supabase = await db();
  const { error } = await supabase.rpc("reorder_leads", {
    p_ids: input.orderedIds,
  });
  if (error) return { error: error.message };
  revalidatePath("/crm");
  return { ok: true };
}
