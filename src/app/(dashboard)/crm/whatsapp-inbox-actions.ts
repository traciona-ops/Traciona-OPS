"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteConversationDomain,
  fetchDockContextDomain,
  fetchLeadHistoryDomain,
  fetchThreadDomain,
  listChatNumbersDomain,
  markAllConversationsReadDomain,
  markConversationReadDomain,
  markConversationUnreadDomain,
  startConversationDomain,
} from "@/lib/whatsapp/inbox";
import {
  deleteConversationSchema,
  startConversationSchema,
} from "@/lib/whatsapp/schemas";

/**
 * Números disponíveis pro FILTRO do chat (qualquer usuário logado).
 * Nunca devolve token — só id, nome e se é o principal.
 */
export async function listChatNumbers() {
  const { getProfile } = await import("@/lib/auth");
  await getProfile(); // só autenticados
  return listChatNumbersDomain(createAdminClient());
}

/**
 * Thread pro chat flutuante (dock): últimas mensagens com mídia ASSINADA
 * (bucket privado). RLS decide se o usuário pode ver o lead.
 */
export async function fetchThread(leadId: string) {
  const supabase = await createClient();
  return fetchThreadDomain(supabase, leadId);
}

/**
 * Contexto COMPLETO do lead pro chat flutuante (mesmos dados da página de
 * mensagens): lead + tags + dono, etapas, time, tarefas, notas, reuniões,
 * agendadas, respostas rápidas e status da conexão. RLS aplica em tudo.
 */
export async function fetchDockContext(leadId: string) {
  const supabase = await createClient();
  return fetchDockContextDomain(supabase, leadId);
}

/**
 * Nova conversa pelo chat flutuante: acha-ou-cria o lead pelo número
 * (mesma dedup canônica do webhook — número repetido volta o lead existente)
 * e devolve os dados pra abrir o chat na hora.
 */
export async function startConversation(input: { phone: string; name?: string }) {
  const parsed = startConversationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Número inválido — use DDD + número (ex.: 5511999998888)." };
  }
  const { getProfile } = await import("@/lib/auth");
  const profile = await getProfile();
  const supabase = await createClient();
  const r = await startConversationDomain(
    supabase,
    createAdminClient(),
    {
      phone: parsed.data.phone,
      name: parsed.data.name,
      sector: profile.sector,
    }
  );
  if ("error" in r) return r;
  revalidatePath("/crm");
  return r;
}

/**
 * Histórico de movimentação do lead: trocas de etapa (lead_stage_history,
 * preenchido por trigger desde a Fase 1) + transferências de responsável.
 */
export async function fetchLeadHistory(leadId: string) {
  const supabase = await createClient();
  return fetchLeadHistoryDomain(supabase, leadId);
}

/**
 * Exclui a CONVERSA: apaga todas as mensagens (e as mídias do storage).
 * Se o contato estiver fora do funil (sem card), remove o contato também.
 * Só admin/gestor — e só se o RLS deixar ver o lead (gestor do setor A
 * não apaga conversa do setor B por UUID).
 */
export async function deleteConversation(leadId: string) {
  const parsed = deleteConversationSchema.safeParse({ leadId });
  if (!parsed.success) {
    return { error: "Conversa não encontrada." };
  }
  const { getProfile } = await import("@/lib/auth");
  const { can } = await import("@/lib/permissions");
  const profile = await getProfile();
  if (!can.deleteLead(profile.role)) {
    return { error: "Sem permissão para excluir conversas." };
  }

  const supabase = await createClient();
  const r = await deleteConversationDomain(
    supabase,
    createAdminClient(),
    parsed.data.leadId
  );
  if ("error" in r) return r;
  revalidatePath("/chat");
  revalidatePath("/crm");
  return r;
}

/** Marca TODAS as conversas como lidas (a RLS limita ao que o usuário vê). */
export async function markAllConversationsRead() {
  const supabase = await createClient();
  const r = await markAllConversationsReadDomain(supabase);
  if ("error" in r) return r;
  revalidatePath("/crm/mensagens");
  return r;
}

export async function markConversationRead(leadId: string) {
  const supabase = await createClient();
  const r = await markConversationReadDomain(supabase, leadId);
  if ("error" in r) return r;
  revalidatePath("/crm/mensagens");
  return r;
}

/**
 * Marca a conversa como NÃO lida (volta o badge): reabre a última mensagem
 * recebida. Ao abrir a conversa de novo, ela é lida normalmente.
 */
export async function markConversationUnread(leadId: string) {
  const supabase = await createClient();
  return markConversationUnreadDomain(supabase, leadId);
}
