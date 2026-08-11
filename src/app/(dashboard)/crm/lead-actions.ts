"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  resolveOwnerIdForCreate,
  resolveSectorForCreate,
  createLeadDomain,
  createContactDomain,
  moveLeadDomain,
  moveAllLeadsDomain,
  updateLeadDomain,
  deleteLeadDomain,
  addNoteDomain,
  addTagDomain,
  removeTagDomain,
  attachLeadToPipelineDomain,
  addLeadToPipelineDomain,
  attachDealDomain,
  transferLeadDomain,
  createLeadSchema,
  createContactSchema,
  moveLeadSchema,
  updateLeadSchema,
  deleteLeadSchema,
  addNoteSchema,
  addTagSchema,
  removeTagSchema,
  attachDealSchema,
  moveAllLeadsSchema,
  transferLeadSchema,
  attachLeadToPipelineSchema,
  addLeadToPipelineSchema,
} from "@/lib/crm/leads";
import type { LeadSource, Sector } from "@/lib/types";
import { db, ensure } from "./_helpers";

function zodError(err: { issues: { message: string }[] }) {
  return { error: err.issues[0]?.message ?? "Dados inválidos." };
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
  const parsed = createLeadSchema.safeParse(input);
  if (!parsed.success) return zodError(parsed.error);

  const supabase = await db();
  const profile = await getProfile();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const result = await createLeadDomain(supabase, {
    ...parsed.data,
    owner_id: resolveOwnerIdForCreate(
      profile.role,
      user?.id,
      parsed.data.owner_id
    ),
    sector: resolveSectorForCreate(
      profile.role,
      profile.sector,
      parsed.data.sector
    ),
  });
  if ("error" in result) return result;
  revalidatePath("/crm");
  return result;
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
  const parsed = createContactSchema.safeParse(input);
  if (!parsed.success) return zodError(parsed.error);

  const supabase = await db();
  const profile = await getProfile();

  const result = await createContactDomain(supabase, {
    ...parsed.data,
    owner_id: profile.id,
    sector: profile.sector,
  });
  if ("error" in result) return result;
  revalidatePath("/contatos");
  return result;
}

/**
 * Contato → negócio: coloca um contato que vive só no chat dentro do funil,
 * no topo da primeira etapa do pipeline padrão. Quem já tem card não muda
 * (contato ≠ negócio: aqui é o único caminho de promoção, nunca automático).
 */
export async function attachLeadToPipeline(leadId: string) {
  const parsed = attachLeadToPipelineSchema.safeParse({ leadId });
  if (!parsed.success) return zodError(parsed.error);

  const supabase = await db();
  const result = await attachLeadToPipelineDomain(supabase, parsed.data.leadId);
  if ("error" in result) return result;
  revalidatePath("/crm");
  revalidatePath("/contatos");
  return result;
}

export async function moveLead(input: {
  leadId: string;
  toStageId: string;
  orderedIds: string[];
}) {
  const parsed = moveLeadSchema.safeParse(input);
  if (!parsed.success) return zodError(parsed.error);

  const supabase = await db();
  const result = await moveLeadDomain(supabase, parsed.data);
  if ("error" in result) return result;
  revalidatePath("/crm");
  return result;
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
  const parsed = updateLeadSchema.safeParse({ leadId, patch });
  if (!parsed.success) return zodError(parsed.error);

  const supabase = await db();
  const result = await updateLeadDomain(
    supabase,
    parsed.data.leadId,
    parsed.data.patch
  );
  if ("error" in result) return result;
  revalidatePath("/crm");
  revalidatePath("/crm/leads/[id]", "page");
  return result;
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

  const parsed = deleteLeadSchema.safeParse({ leadId });
  if (!parsed.success) return zodError(parsed.error);

  const supabase = await db();
  const result = await deleteLeadDomain(supabase, parsed.data.leadId);
  if ("error" in result) return result;
  revalidatePath("/crm");
  return result;
}

export async function addNote(leadId: string, content: string) {
  const parsed = addNoteSchema.safeParse({ leadId, content });
  if (!parsed.success) return zodError(parsed.error);

  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const result = await addNoteDomain(supabase, {
    leadId: parsed.data.leadId,
    content: parsed.data.content,
    authorId: user?.id ?? null,
  });
  if ("error" in result) return result;
  revalidatePath("/crm/leads/[id]", "page");
  return result;
}

export async function addTag(leadId: string, tag: string, color: string) {
  const parsed = addTagSchema.safeParse({ leadId, tag, color });
  if (!parsed.success) return zodError(parsed.error);

  const supabase = await db();
  const result = await addTagDomain(supabase, parsed.data);
  if ("error" in result) return result;
  revalidatePath("/crm/leads/[id]", "page");
  revalidatePath("/crm");
  return result;
}

export async function removeTag(tagId: string, leadId: string) {
  const parsed = removeTagSchema.safeParse({ tagId, leadId });
  if (!parsed.success) return zodError(parsed.error);

  const supabase = await db();
  const result = await removeTagDomain(supabase, parsed.data);
  if ("error" in result) return result;
  revalidatePath("/crm/leads/[id]", "page");
  revalidatePath("/crm");
  return result;
}

/**
 * Adiciona ao funil um lead que hoje é SÓ CONVERSA (sem pipeline).
 * Vai pro topo da primeira etapa do funil padrão (nunca CS).
 */
export async function addLeadToPipeline(leadId: string) {
  const parsed = addLeadToPipelineSchema.safeParse({ leadId });
  if (!parsed.success) return zodError(parsed.error);

  const supabase = await db();
  const result = await addLeadToPipelineDomain(supabase, parsed.data.leadId);
  if ("error" in result) return result;
  revalidatePath("/crm");
  revalidatePath("/crm/leads/[id]", "page");
  return result;
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
  const parsed = attachDealSchema.safeParse(input);
  if (!parsed.success) return zodError(parsed.error);

  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const result = await attachDealDomain(supabase, {
    ...parsed.data,
    authorId: user?.id ?? null,
  });
  if ("error" in result) return result;
  revalidatePath("/crm");
  return result;
}

/** Move TODOS os cards de uma etapa pra outra (1 UPDATE). */
export async function moveAllLeads(fromStageId: string, toStageId: string) {
  const denied = await ensure(can.configurePipelines);
  if (denied) return denied;

  const parsed = moveAllLeadsSchema.safeParse({ fromStageId, toStageId });
  if (!parsed.success) return zodError(parsed.error);

  const supabase = await db();
  const result = await moveAllLeadsDomain(supabase, parsed.data);
  if ("error" in result) return result;
  revalidatePath("/crm");
  return result;
}

export async function transferLead(
  leadId: string,
  toUserId: string,
  reason: string
) {
  const denied = await ensure(can.transferLead);
  if (denied) return denied;

  const parsed = transferLeadSchema.safeParse({ leadId, toUserId, reason });
  if (!parsed.success) return zodError(parsed.error);

  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const result = await transferLeadDomain(supabase, {
    ...parsed.data,
    actorUserId: user?.id ?? null,
  });
  if ("error" in result) return result;
  revalidatePath("/crm/leads/[id]", "page");
  revalidatePath("/crm");
  return result;
}
