"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can, NOT_ALLOWED } from "@/lib/permissions";
import { slugify } from "@/lib/slug";
import type {
  LeadSource,
  UserRole,
  Sector,
  Automation,
  AutomationTrigger,
  PipelineStage,
} from "@/lib/types";

async function db() {
  return await createClient();
}

// Trava amigável por papel (a RLS no banco é a trava real).
async function ensure(check: (r: UserRole) => boolean) {
  const { role } = await getProfile();
  return check(role) ? null : { error: NOT_ALLOWED };
}

export async function createLead(input: {
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  instagram?: string;
  source: LeadSource;
  value?: number;
  pipeline_id: string;
  stage_id: string;
  owner_id?: string | null;
  sector?: Sector;
}) {
  const supabase = await db();
  const profile = await getProfile();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Vendedor só cria lead pra si mesmo (exigência da RLS). Manager pode atribuir.
  const ownerId = can.viewAllLeads(profile.role)
    ? input.owner_id || user?.id || null
    : user?.id ?? null;
  // Só admin escolhe setor livremente; demais criam no próprio setor (RLS exige).
  const sector =
    profile.role === "admin" ? input.sector ?? profile.sector : profile.sector;

  // Lead novo vai pro TOPO da etapa → menor position (a lista ordena por position ASC).
  const { data: top } = await supabase
    .from("leads")
    .select("position")
    .eq("stage_id", input.stage_id)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  const position = top ? top.position - 1 : 0;

  const { data, error } = await supabase
    .from("leads")
    .insert({
      name: input.name,
      phone: input.phone || null,
      email: input.email || null,
      company: input.company || null,
      instagram: input.instagram || null,
      source: input.source,
      value: input.value ?? 0,
      pipeline_id: input.pipeline_id,
      stage_id: input.stage_id,
      owner_id: ownerId,
      sector,
      position,
    })
    .select("id")
    .single();

  if (error) {
    // Índice único no número canônico → já existe lead com esse telefone.
    if (error.code === "23505" || error.message.includes("ux_leads_canonical_phone")) {
      return { error: "Já existe um lead com esse número de telefone." };
    }
    return { error: error.message };
  }
  revalidatePath("/crm");
  return { id: data.id };
}

/**
 * Cria um CONTATO puro (sem card no funil) — contato ≠ negócio: a pessoa
 * entra na base (Contatos, contratos, chat) e só vira negócio se promovida.
 */
export async function createContact(input: {
  name: string;
  phone?: string;
  email?: string;
  company?: string;
}) {
  const supabase = await db();
  const profile = await getProfile();
  const name = input.name.trim();
  if (!name) return { error: "Informe o nome do contato." };

  const { data, error } = await supabase
    .from("leads")
    .insert({
      name,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      company: input.company?.trim() || null,
      source: "manual",
      value: 0,
      pipeline_id: null,
      stage_id: null,
      owner_id: profile.id,
      sector: profile.sector,
    })
    .select("id")
    .single();

  if (error) {
    if (
      error.code === "23505" ||
      error.message.includes("ux_leads_canonical_phone")
    ) {
      return { error: "Já existe um contato com esse número de telefone." };
    }
    return { error: error.message };
  }
  revalidatePath("/contatos");
  return { id: data.id };
}

/**
 * Contato → negócio: coloca um contato que vive só no chat dentro do funil,
 * no topo da primeira etapa do pipeline padrão. Quem já tem card não muda
 * (contato ≠ negócio: aqui é o único caminho de promoção, nunca automático).
 */
export async function attachLeadToPipeline(leadId: string) {
  const supabase = await db();

  const { data: lead } = await supabase
    .from("leads")
    .select(selectLead('basic'))
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { error: "Contato não encontrado." };
  if (lead.pipeline_id)
    return { error: "Esse contato já tem um negócio no funil." };

  const { data: pipeline } = await supabase
    .from("pipelines")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!pipeline) return { error: "Nenhum funil configurado." };

  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_id", pipeline.id)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!stage) return { error: "O funil não tem etapas." };

  const { data: top } = await supabase
    .from("leads")
    .select("position")
    .eq("stage_id", stage.id)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  const position = top ? top.position - 1 : 0;

  const { error } = await supabase
    .from("leads")
    .update({
      pipeline_id: pipeline.id,
      stage_id: stage.id,
      position,
      stage_changed_at: new Date().toISOString(),
    })
    .eq("id", leadId);
  if (error) return { error: error.message };

  revalidatePath("/crm");
  revalidatePath("/contatos");
  return { ok: true };
}

export async function moveLead(input: {
  leadId: string;
  toStageId: string;
  orderedIds: string[];
}) {
  const supabase = await db();

  // SLA: stage_changed_at só muda quando o card TROCA de etapa. Reordenar
  // dentro da mesma coluna não pode zerar o cronômetro "parado há X dias".
  const [{ data: cur }, { data: destStage }] = await Promise.all([
    supabase.from("leads").select("stage_id").eq("id", input.leadId).maybeSingle(),
    supabase
      .from("pipeline_stages")
      .select("pipeline_id")
      .eq("id", input.toStageId)
      .maybeSingle(),
  ]);
  const changedStage = cur?.stage_id !== input.toStageId;

  const patch: Record<string, unknown> = { stage_id: input.toStageId };
  if (destStage?.pipeline_id) patch.pipeline_id = destStage.pipeline_id;
  if (changedStage) patch.stage_changed_at = new Date().toISOString();

  const { error } = await supabase
    .from("leads")
    .update(patch)
    .eq("id", input.leadId);

  if (error) return { error: error.message };

  // Reindex das posições em 1 UPDATE (antes: N updates paralelos)
  const { error: reErr } = await supabase.rpc("reorder_leads", {
    p_ids: input.orderedIds,
  });
  if (reErr) return { error: reErr.message };

  revalidatePath("/crm");
  return { ok: true };
}

// ---------- Configuração: Etapas ----------

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

// ---------- Configuração: Pipelines ----------

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

export async function updateLead(
  leadId: string,
  patch: Partial<{
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
  }>
) {
  const supabase = await db();
  const finalPatch: Record<string, unknown> = { ...patch };
  if (patch.stage_id) {
    // só reinicia o cronômetro da etapa se a etapa realmente mudou
    const { data: cur } = await supabase
      .from("leads")
      .select("stage_id")
      .eq("id", leadId)
      .maybeSingle();
    if (cur?.stage_id !== patch.stage_id) {
      finalPatch.stage_changed_at = new Date().toISOString();
    }
  }
  const { error } = await supabase
    .from("leads")
    .update(finalPatch)
    .eq("id", leadId);
  if (error) return { error: error.message };
  revalidatePath("/crm");
  revalidatePath("/crm/leads/[id]", "page");
  return { ok: true };
}

// ---------- Reuniões / Agendamentos ----------

export async function createMeeting(input: {
  leadId: string;
  title: string;
  startsAt: string; // ISO
  endsAt?: string | null;
  location?: string | null;
}) {
  if (!input.title.trim() || !input.startsAt)
    return { error: "Título e data/hora são obrigatórios." };
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ends =
    input.endsAt ||
    new Date(new Date(input.startsAt).getTime() + 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from("meetings").insert({
    lead_id: input.leadId,
    title: input.title.trim(),
    starts_at: input.startsAt,
    ends_at: ends,
    location: input.location || null,
    created_by: user?.id ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/crm/mensagens");
  revalidatePath("/agenda");
  revalidatePath("/crm/leads/[id]", "page");
  return { ok: true };
}

export async function deleteMeeting(meetingId: string) {
  const supabase = await db();
  const { error } = await supabase.from("meetings").delete().eq("id", meetingId);
  if (error) return { error: error.message };
  revalidatePath("/crm/mensagens");
  revalidatePath("/agenda");
  return { ok: true };
}

// ---------- Tarefas ----------

export async function createTask(input: {
  leadId?: string | null;
  title: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  category?: string | null;
  priority?: string | null;
}) {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("lead_tasks").insert({
    lead_id: input.leadId || null,
    title: input.title,
    assignee_id: input.assigneeId || null,
    due_date: input.dueDate || null,
    category: input.category || null,
    priority: input.priority || "normal",
    status: "a_fazer",
    created_by: user?.id ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/crm");
  revalidatePath("/atividades");
  if (input.leadId) revalidatePath("/crm/leads/[id]", "page");
  return { ok: true };
}

export async function toggleTask(
  taskId: string,
  leadId: string | null,
  done: boolean
) {
  const supabase = await db();
  const { error } = await supabase
    .from("lead_tasks")
    .update({
      done,
      status: done ? "concluida" : "a_fazer",
      completed_at: done ? new Date().toISOString() : null,
    })
    .eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath("/crm");
  revalidatePath("/atividades");
  if (leadId) revalidatePath("/crm/leads/[id]", "page");
  return { ok: true };
}

/** Edita a tarefa (status do quadro, prioridade, prazo, título, responsável). */
export async function updateTask(
  taskId: string,
  patch: Partial<{
    title: string;
    due_date: string | null;
    assignee_id: string | null;
    category: string | null;
    status: "a_fazer" | "em_andamento" | "concluida";
    priority: "urgente" | "alta" | "normal" | "baixa";
  }>
) {
  const supabase = await db();
  const finalPatch: Record<string, unknown> = { ...patch };
  // status e done andam juntos (compatibilidade com o resto do app)
  if (patch.status) {
    finalPatch.done = patch.status === "concluida";
    finalPatch.completed_at =
      patch.status === "concluida" ? new Date().toISOString() : null;
  }
  const { error } = await supabase
    .from("lead_tasks")
    .update(finalPatch)
    .eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath("/atividades");
  revalidatePath("/crm");
  return { ok: true };
}

export async function deleteTask(taskId: string, leadId: string | null) {
  const supabase = await db();
  const { error } = await supabase
    .from("lead_tasks")
    .delete()
    .eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath("/crm");
  revalidatePath("/atividades");
  if (leadId) revalidatePath("/crm/leads/[id]", "page");
  return { ok: true };
}

/**
 * Exclui o CARD (negócio). Contato é outra coisa: se o lead tem conversa no
 * WhatsApp, ele só sai do funil — contato e mensagens continuam no OPS Chat.
 * Apagar de verdade só quando não existe conversa (negócio manual puro);
 * excluir o CONTATO é ação do chat (deleteConversation).
 */
export async function deleteLead(leadId: string) {
  const denied = await ensure(can.deleteLead);
  if (denied) return denied;
  const supabase = await db();

  const { count } = await supabase
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId);

  if ((count ?? 0) > 0) {
    const { error } = await supabase
      .from("leads")
      .update({ pipeline_id: null, stage_id: null })
      .eq("id", leadId);
    if (error) return { error: error.message };
    revalidatePath("/crm");
    return { ok: true, detached: true };
  }

  const { error } = await supabase.from("leads").delete().eq("id", leadId);
  if (error) return { error: error.message };
  revalidatePath("/crm");
  return { ok: true };
}

export async function addNote(leadId: string, content: string) {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("lead_notes").insert({
    lead_id: leadId,
    author_id: user?.id ?? null,
    content,
  });
  if (error) return { error: error.message };

  await supabase
    .from("leads")
    .update({ last_contact_at: new Date().toISOString() })
    .eq("id", leadId);

  revalidatePath("/crm/leads/[id]", "page");
  return { ok: true };
}

export async function addTag(leadId: string, tag: string, color: string) {
  const supabase = await db();
  const { error } = await supabase
    .from("lead_tags")
    .insert({ lead_id: leadId, tag, color });
  if (error) return { error: error.message };
  revalidatePath("/crm/leads/[id]", "page");
  revalidatePath("/crm");
  return { ok: true };
}

export async function removeTag(tagId: string, leadId: string) {
  const supabase = await db();
  const { error } = await supabase.from("lead_tags").delete().eq("id", tagId);
  if (error) return { error: error.message };
  revalidatePath("/crm/leads/[id]", "page");
  revalidatePath("/crm");
  return { ok: true };
}

/**
 * Adiciona ao funil um lead que hoje é SÓ CONVERSA (sem pipeline).
 * Vai pro topo da primeira etapa do funil padrão (nunca CS).
 */
export async function addLeadToPipeline(leadId: string) {
  const supabase = await db();

  const { data: pipeline } = await supabase
    .from("pipelines")
    .select("id")
    .eq("archived", false)
    .eq("is_cs", false)
    .order("is_default", { ascending: false })
    .order("position")
    .limit(1)
    .maybeSingle();
  if (!pipeline) return { error: "Nenhum funil disponível." };

  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_id", pipeline.id)
    .order("position")
    .limit(1)
    .maybeSingle();
  if (!stage) return { error: "O funil padrão não tem etapas." };

  const { data: top } = await supabase
    .from("leads")
    .select("position")
    .eq("stage_id", stage.id)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase
    .from("leads")
    .update({
      pipeline_id: pipeline.id,
      stage_id: stage.id,
      stage_changed_at: new Date().toISOString(),
      position: top ? top.position - 1 : 0,
    })
    .eq("id", leadId);
  if (error) return { error: error.message };

  revalidatePath("/crm");
  revalidatePath("/crm/leads/[id]", "page");
  return { ok: true };
}

/**
 * Cria o NEGÓCIO em cima de um contato existente (ex.: alguém que está só
 * no chat): aplica valor/origem/responsável e coloca o card na etapa.
 */
export async function attachDeal(input: {
  leadId: string;
  pipeline_id: string;
  stage_id: string;
  value?: number;
  source?: LeadSource;
  owner_id?: string | null;
  description?: string | null;
}) {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: top } = await supabase
    .from("leads")
    .select("position")
    .eq("stage_id", input.stage_id)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    pipeline_id: input.pipeline_id,
    stage_id: input.stage_id,
    stage_changed_at: new Date().toISOString(),
    position: top ? top.position - 1 : 0,
  };
  if (input.value !== undefined) patch.value = input.value;
  if (input.source) patch.source = input.source;
  if (input.owner_id !== undefined) patch.owner_id = input.owner_id;

  const { error } = await supabase
    .from("leads")
    .update(patch)
    .eq("id", input.leadId);
  if (error) return { error: error.message };

  if (input.description?.trim()) {
    await supabase.from("lead_notes").insert({
      lead_id: input.leadId,
      author_id: user?.id ?? null,
      content: input.description.trim(),
    });
  }

  revalidatePath("/crm");
  return { ok: true };
}

/** Move TODOS os cards de uma etapa pra outra (1 UPDATE). */
export async function moveAllLeads(fromStageId: string, toStageId: string) {
  const denied = await ensure(can.configurePipelines);
  if (denied) return denied;
  if (!toStageId || fromStageId === toStageId) {
    return { error: "Escolha uma etapa de destino diferente." };
  }
  const supabase = await db();
  const { error } = await supabase
    .from("leads")
    .update({
      stage_id: toStageId,
      stage_changed_at: new Date().toISOString(),
    })
    .eq("stage_id", fromStageId);
  if (error) return { error: error.message };
  revalidatePath("/crm");
  return { ok: true };
}

// ---------- Automações de movimentação de card ----------

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

export async function transferLead(
  leadId: string,
  toUserId: string,
  reason: string
) {
  const denied = await ensure(can.transferLead);
  if (denied) return denied;
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: lead } = await supabase
    .from("leads")
    .select("owner_id")
    .eq("id", leadId)
    .single();

  const { error } = await supabase.from("lead_transfers").insert({
    lead_id: leadId,
    from_user: lead?.owner_id ?? user?.id ?? null,
    to_user: toUserId,
    reason,
  });
  if (error) return { error: error.message };

  await supabase
    .from("leads")
    .update({ owner_id: toUserId })
    .eq("id", leadId);

  revalidatePath("/crm/leads/[id]", "page");
  revalidatePath("/crm");
  return { ok: true };
}
