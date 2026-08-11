import type { CrmDb } from "@/lib/crm/supabase-db";
import type { LeadSource } from "@/lib/types";
import { placeLeadInDefaultPipeline } from "@/lib/crm/pipeline-placement";
import { nextTopPositionForStage } from "./helpers";

function mapPlaceErrors(
  placed: Awaited<ReturnType<typeof placeLeadInDefaultPipeline>>,
  messages: { no_pipeline: string; no_stage: string }
): { ok: true } | { error: string } {
  if (!placed.ok) return { error: placed.error };
  if (!placed.placed) {
    if (placed.reason === "no_pipeline") return { error: messages.no_pipeline };
    if (placed.reason === "no_stage") return { error: messages.no_stage };
  }
  return { ok: true };
}

export async function attachLeadToPipelineDomain(
  db: CrmDb,
  leadId: string
): Promise<{ ok: true } | { error: string }> {
  const { data: lead } = await db
    .from("leads")
    .select("pipeline_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { error: "Contato não encontrado." };
  if (lead.pipeline_id)
    return { error: "Esse contato já tem um negócio no funil." };

  const placed = await placeLeadInDefaultPipeline(db, leadId, {
    skipIfHasPipeline: false,
  });
  return mapPlaceErrors(placed, {
    no_pipeline: "Nenhum funil configurado.",
    no_stage: "O funil não tem etapas.",
  });
}

export async function addLeadToPipelineDomain(
  db: CrmDb,
  leadId: string
): Promise<{ ok: true } | { error: string }> {
  const placed = await placeLeadInDefaultPipeline(db, leadId, {
    skipIfHasPipeline: false,
  });
  return mapPlaceErrors(placed, {
    no_pipeline: "Nenhum funil disponível.",
    no_stage: "O funil padrão não tem etapas.",
  });
}

export type AttachDealDomainInput = {
  leadId: string;
  pipeline_id: string;
  stage_id: string;
  value?: number;
  source?: LeadSource;
  owner_id?: string | null;
  description?: string | null;
  authorId: string | null;
};

export async function attachDealDomain(
  db: CrmDb,
  input: AttachDealDomainInput
): Promise<{ ok: true } | { error: string }> {
  const position = await nextTopPositionForStage(db, input.stage_id);

  const patch: Record<string, unknown> = {
    pipeline_id: input.pipeline_id,
    stage_id: input.stage_id,
    stage_changed_at: new Date().toISOString(),
    position,
  };
  if (input.value !== undefined) patch.value = input.value;
  if (input.source) patch.source = input.source;
  if (input.owner_id !== undefined) patch.owner_id = input.owner_id;

  const { error } = await db.from("leads").update(patch).eq("id", input.leadId);
  if (error) return { error: error.message };

  if (input.description?.trim()) {
    await db.from("lead_notes").insert({
      lead_id: input.leadId,
      author_id: input.authorId,
      content: input.description.trim(),
    });
  }

  return { ok: true };
}

export async function transferLeadDomain(
  db: CrmDb,
  input: {
    leadId: string;
    toUserId: string;
    reason: string;
    actorUserId: string | null;
  }
): Promise<{ ok: true } | { error: string }> {
  const { data: lead } = await db
    .from("leads")
    .select("owner_id")
    .eq("id", input.leadId)
    .single();

  const { error } = await db.from("lead_transfers").insert({
    lead_id: input.leadId,
    from_user: lead?.owner_id ?? input.actorUserId,
    to_user: input.toUserId,
    reason: input.reason,
  });
  if (error) return { error: error.message };

  await db
    .from("leads")
    .update({ owner_id: input.toUserId })
    .eq("id", input.leadId);

  return { ok: true };
}
