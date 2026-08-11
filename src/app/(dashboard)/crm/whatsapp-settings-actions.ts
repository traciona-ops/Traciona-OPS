"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getStatus,
  sendChatPresence,
} from "@/lib/services/whatsapp/dinastia";
import { resolveLeadNumber } from "@/lib/services/whatsapp/numbers";

export async function createQuickReply(input: {
  title: string;
  content: string;
  shortcut?: string;
}) {
  if (!input.title.trim() || !input.content.trim())
    return { error: "Título e conteúdo são obrigatórios." };
  const supabase = await createClient();
  const { error } = await supabase.from("quick_replies").insert({
    title: input.title.trim(),
    content: input.content.trim(),
    shortcut: input.shortcut?.trim() || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/crm/mensagens");
  return { ok: true };
}

/** Lista os templates de resposta rápida (pra tela de Configurações do chat). */
export async function listQuickReplies() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quick_replies")
    .select("*")
    .order("title");
  if (error) return { error: error.message };
  return { ok: true as const, quickReplies: data ?? [] };
}

export async function deleteQuickReply(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("quick_replies").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/crm/mensagens");
  return { ok: true };
}

/** Status da conexão (qualquer autenticado — só booleans, nada sensível). */
export async function getConnectionStatus(): Promise<{ connected: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { connected: false };
  const s = await getStatus();
  const d = (s.data ?? {}) as { connected?: boolean; loggedIn?: boolean };
  return { connected: !!(s.ok && d.connected && d.loggedIn) };
}

// ---------- Configurações do número (chat) ----------

export type ChatSettings = {
  signature: boolean;
  auto_create_card: boolean;
  sessions_enabled: boolean;
};

export async function getChatSettings(): Promise<ChatSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_settings")
    .select("value")
    .eq("key", "chat")
    .maybeSingle();
  const v = (data?.value ?? {}) as Partial<ChatSettings>;
  return {
    signature: !!v.signature,
    auto_create_card: !!v.auto_create_card,
    sessions_enabled: !!v.sessions_enabled,
  };
}

export async function updateChatSettings(patch: Partial<ChatSettings>) {
  const supabase = await createClient();
  // Grava por cima do JSON cru, não do tipo: `chat` guarda chaves que esta tela
  // não conhece (`vip_stage_names`, por exemplo) e reconstruir o objeto a partir
  // de ChatSettings apagaria elas em silêncio a cada toggle.
  const { data } = await supabase
    .from("org_settings")
    .select("value")
    .eq("key", "chat")
    .maybeSingle();
  const raw = (data?.value ?? {}) as Record<string, unknown>;
  const next = { ...raw, ...patch };
  // RLS: só admin/gestor consegue gravar
  const { error } = await supabase
    .from("org_settings")
    .upsert({ key: "chat", value: next, updated_at: new Date().toISOString() });
  if (error) return { error: error.message };
  try {
    const { bustSessionsSettingsCache } = await import(
      "@/lib/chat-sessions/settings"
    );
    bustSessionsSettingsCache();
  } catch {
    // cache só no server do webhook
  }
  const settings: ChatSettings = {
    signature: !!next.signature,
    auto_create_card: !!next.auto_create_card,
    sessions_enabled: !!next.sessions_enabled,
  };
  return { ok: true, settings };
}

/**
 * Batimento de presença: o OPS Chat aberto pinga aqui a cada ~3 min.
 * Marca a atividade (o cron usa pra decidir available/unavailable) e já
 * declara "available" na hora — o número fica online SÓ com o chat em uso,
 * igual WhatsApp Web, e o "digitando..." dos contatos flui nesse período.
 */
export async function presenceKeepalive() {
  const { getProfile } = await import("@/lib/auth");
  await getProfile();
  const admin = createAdminClient();
  await admin.from("system_state").upsert({
    key: "chat_activity",
    value: { at: new Date().toISOString() },
  });
  const { setGlobalPresence } = await import("@/lib/services/whatsapp/dinastia");
  await setGlobalPresence("available");
  return { ok: true };
}

/**
 * "Digitando..." pro contato. Fire-and-forget da UI (debounced) — nunca
 * retorna erro pra não poluir a conversa.
 */
export async function typingPresence(
  leadId: string,
  state: "composing" | "paused"
) {
  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("phone")
    .eq("id", leadId)
    .maybeSingle();
  const phone = (lead as { phone: string | null } | null)?.phone;
  if (!phone) return { ok: true };
  const { token: authToken } = await resolveLeadNumber(leadId);
  await sendChatPresence(phone, state, authToken);
  return { ok: true };
}
