"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/permissions";
import type {
  Automation,
  AutomationTrigger,
  PipelineStage,
} from "@/lib/types";
import { db, ensure } from "./_helpers";

export async function listAutomations(pipelineId: string): Promise<
  | { error: string }
  | { automations: Automation[]; stages: PipelineStage[] }
> {
  const denied = await ensure(can.configurePipelines);
  if (denied) return denied;
  const supabase = await db();
  const [autoRes, stagesRes] = await Promise.all([
    supabase
      .from("automations")
      .select("*")
      .eq("pipeline_id", pipelineId)
      .order("created_at", { ascending: true }),
    supabase
      .from("pipeline_stages")
      .select("*")
      .eq("pipeline_id", pipelineId)
      .order("position"),
  ]);
  return {
    automations: (autoRes.data ?? []) as Automation[],
    stages: (stagesRes.data ?? []) as PipelineStage[],
  };
}

export async function createAutomation(input: {
  pipeline_id: string;
  stage_id: string;
  trigger: AutomationTrigger;
  trigger_days?: number | null;
  action?: "move_stage" | "send_message";
  to_stage_id?: string | null;
  message_body?: string | null;
  name?: string | null;
}) {
  const denied = await ensure(can.configurePipelines);
  if (denied) return denied;

  const action = input.action ?? "move_stage";
  if (!input.stage_id) {
    return { error: "Escolha a etapa gatilho." };
  }
  if (action === "move_stage") {
    if (!input.to_stage_id) {
      return { error: "Escolha a etapa de destino." };
    }
    if (input.stage_id === input.to_stage_id) {
      return { error: "A etapa de destino tem que ser diferente da etapa gatilho." };
    }
    if (input.trigger === "enter_stage") {
      return {
        error:
          "\"Entrou na etapa\" só combina com enviar mensagem (mover na entrada criaria um loop).",
      };
    }
  }
  if (action === "send_message" && !input.message_body?.trim()) {
    return { error: "Escreva a mensagem que será enviada." };
  }
  const needsDays =
    input.trigger === "stale_days" || input.trigger === "no_reply_days";
  const days = needsDays ? Number(input.trigger_days ?? 0) : null;
  if (needsDays && (!days || days < 1)) {
    return { error: "Informe um número de dias válido (1 ou mais)." };
  }

  const supabase = await db();
  const { error } = await supabase.from("automations").insert({
    pipeline_id: input.pipeline_id,
    stage_id: input.stage_id,
    trigger: input.trigger,
    trigger_days: days,
    action,
    to_stage_id: action === "move_stage" ? input.to_stage_id : null,
    message_body: action === "send_message" ? input.message_body!.trim() : null,
    name: input.name?.trim() || null,
    active: true,
  });
  if (error) return { error: error.message };
  revalidatePath("/crm");
  return { ok: true };
}

export async function toggleAutomation(id: string, active: boolean) {
  const denied = await ensure(can.configurePipelines);
  if (denied) return denied;
  const supabase = await db();
  const { error } = await supabase
    .from("automations")
    .update({ active })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/crm");
  return { ok: true };
}

export async function deleteAutomation(id: string) {
  const denied = await ensure(can.configurePipelines);
  if (denied) return denied;
  const supabase = await db();
  const { error } = await supabase.from("automations").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/crm");
  return { ok: true };
}
