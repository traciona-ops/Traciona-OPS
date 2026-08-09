"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendText,
  sendMedia,
  reactMessage,
  convertAudio,
  getStatus,
  markChatRead,
  revokeMessage,
  editTextMessage,
  sendChatPresence,
  type MediaKind,
} from "@/lib/services/whatsapp/dinastia";
import { resolveLeadNumber } from "@/lib/services/whatsapp/numbers";
import { SECTOR } from "@/lib/data/labels";

export async function sendWhatsappMessage(
  leadId: string,
  body: string,
  replyTo?: {
    providerMsgId: string | null;
    body: string | null;
    direction: "in" | "out";
  }
) {
  let text = body.trim();
  if (!text) return { error: "Mensagem vazia." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: lead } = await supabase
    .from("leads")
    .select('*')
    .eq("id", leadId)
    .single();

  if (!lead?.phone) return { error: "Lead sem telefone." };

  // Assinatura da mensagem (Configurações do número): cabeçalho em NEGRITO
  // no topo, estilo "*Vendas - Adriano*\nmensagem" (asteriscos = negrito no WhatsApp)
  const { data: st } = await supabase
    .from("org_settings")
    .select("value")
    .eq("key", "chat")
    .maybeSingle();
  if ((st?.value as { signature?: boolean } | null)?.signature && user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("name, sector")
      .eq("id", user.id)
      .maybeSingle();
    const first = (prof?.name ?? "").split(" ")[0];
    const sectorLabel =
      SECTOR[(prof?.sector ?? "vendas") as keyof typeof SECTOR]?.label ??
      "Vendas";
    // linha em branco entre a assinatura e a mensagem (pra não ficar colado)
    if (first) text = `*${sectorLabel} - ${first}*\n\n${text}`;
  }

  // multi-número: responde pelo número em que a conversa acontece
  const { numberId, token: authToken } = await resolveLeadNumber(leadId);
  const result = await sendText(
    lead.phone,
    text,
    authToken,
    replyTo?.providerMsgId
      ? { stanzaId: replyTo.providerMsgId, fromMe: replyTo.direction === "out" }
      : undefined
  );

  // Grava a mensagem (status reflete sucesso/falha do envio)
  const { error: insErr } = await supabase.from("whatsapp_messages").insert({
    lead_id: leadId,
    number_id: numberId,
    direction: "out",
    body: text,
    reply_to_body: replyTo
      ? (replyTo.body ?? "[mídia]").slice(0, 180)
      : null,
    reply_to_dir: replyTo?.direction ?? null,
    status: result.ok ? "sent" : "failed",
    provider: "dinastia",
    provider_msg_id: result.ok ? result.id : null,
    sent_by: user?.id ?? null,
  });
  if (insErr) return { error: insErr.message };

  if (result.ok) {
    await supabase
      .from("leads")
      .update({ last_contact_at: new Date().toISOString() })
      .eq("id", leadId);
  }

  revalidatePath("/crm/mensagens");
  revalidatePath("/crm/leads/[id]", "page");

  return result.ok ? { ok: true } : { error: `Falha no envio: ${result.error}` };
}

export async function sendWhatsappMedia(formData: FormData) {
  const leadId = String(formData.get("leadId") || "");
  const caption = String(formData.get("caption") || "");
  const file = formData.get("file") as File | null;
  if (!leadId || !file) return { error: "Dados incompletos." };
  if (file.size > 30 * 1024 * 1024) return { error: "Arquivo acima de 30MB." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: lead } = await supabase
    .from("leads")
    .select('*')
    .eq("id", leadId)
    .single();
  if (!lead?.phone) return { error: "Lead sem telefone." };

  const mime = file.type || "application/octet-stream";
  const kind: MediaKind = mime.startsWith("image/")
    ? "image"
    : mime.startsWith("audio/")
    ? "audio"
    : mime.startsWith("video/")
    ? "video"
    : "document";

  const buf = Buffer.from(await file.arrayBuffer());

  // Upload no Storage (para exibir no thread)
  const admin = createAdminClient();
  const safeName = (file.name || "arquivo").replace(/[^\w.\-]/g, "_");
  const path = `${leadId}/${Date.now()}-${safeName}`;
  const { error: upErr } = await admin.storage
    .from("whatsapp-media")
    .upload(path, buf, { contentType: mime, upsert: false });
  if (upErr) return { error: `Upload falhou: ${upErr.message}` };
  const publicUrl = admin.storage.from("whatsapp-media").getPublicUrl(path)
    .data.publicUrl;

  // Áudio: reencoda via conversor (senão a instância não entrega a nota de voz).
  // Demais mídias seguem como base64 data URI normal.
  let payload = `data:${mime};base64,${buf.toString("base64")}`;
  if (kind === "audio") {
    // Bucket é privado → o conversor externo precisa de uma signed URL pra baixar.
    const signed = await admin.storage
      .from("whatsapp-media")
      .createSignedUrl(path, 300);
    const converted = await convertAudio(
      signed.data?.signedUrl ?? publicUrl,
      mime
    );
    if (converted) payload = converted;
  }
  const { numberId, token: authToken } = await resolveLeadNumber(leadId);
  const result = await sendMedia(
    lead.phone,
    kind,
    payload,
    {
      caption,
      fileName: file.name,
      mime,
    },
    authToken
  );

  await supabase.from("whatsapp_messages").insert({
    lead_id: leadId,
    number_id: numberId,
    direction: "out",
    body: caption || null,
    media_url: publicUrl,
    media_type: kind,
    status: result.ok ? "sent" : "failed",
    provider: "dinastia",
    provider_msg_id: result.ok ? result.id : null,
    sent_by: user?.id ?? null,
  });

  if (result.ok) {
    await supabase
      .from("leads")
      .update({ last_contact_at: new Date().toISOString() })
      .eq("id", leadId);
  }

  revalidatePath("/crm/mensagens");
  revalidatePath("/crm/leads/[id]", "page");
  return result.ok ? { ok: true } : { error: `Falha no envio: ${result.error}` };
}

export async function scheduleMessage(
  leadId: string,
  body: string,
  sendAt: string // ISO
) {
  const text = body.trim();
  if (!text) return { error: "Mensagem vazia." };
  if (!sendAt) return { error: "Escolha a data/hora do envio." };
  if (new Date(sendAt).getTime() <= Date.now())
    return { error: "A data/hora precisa ser no futuro." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: lead } = await supabase
    .from("leads")
    .select('*')
    .eq("id", leadId)
    .single();
  if (!lead?.phone) return { error: "Lead sem telefone." };

  const { error } = await supabase.from("scheduled_messages").insert({
    lead_id: leadId,
    body: text,
    send_at: sendAt,
    created_by: user?.id ?? null,
  });
  if (error) return { error: error.message };

  revalidatePath("/crm/mensagens");
  revalidatePath("/crm/leads/[id]", "page");
  return { ok: true };
}

export async function cancelScheduledMessage(id: string, leadId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("scheduled_messages")
    .update({ status: "canceled" })
    .eq("id", id)
    .eq("status", "pending");
  if (error) return { error: error.message };
  revalidatePath("/crm/mensagens");
  revalidatePath("/crm/leads/[id]", "page");
  return { ok: true };
}

export async function reactToMessage(
  leadId: string,
  messageId: string,
  direction: "in" | "out",
  emoji: string
) {
  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("phone")
    .eq("id", leadId)
    .single();
  if (!lead?.phone) return { error: "Lead sem telefone." };

  const r = await reactMessage(lead.phone, messageId, emoji, direction === "out");
  if (!r.ok) return { error: `Falha na reação: ${r.error}` };

  await supabase
    .from("whatsapp_messages")
    .update({ reaction: emoji || null })
    .eq("provider_msg_id", messageId);

  revalidatePath("/crm/mensagens");
  return { ok: true };
}

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

/**
 * Números disponíveis pro FILTRO do chat (qualquer usuário logado).
 * Nunca devolve token — só id, nome e se é o principal.
 */
export async function listChatNumbers() {
  const { getProfile } = await import("@/lib/auth");
  await getProfile(); // só autenticados
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("wa_numbers")
    .select("id, name, env_default")
    .eq("active", true)
    .order("env_default", { ascending: false })
    .order("created_at");
  if (error) return { error: error.message };
  return {
    ok: true as const,
    numbers: (data ?? []) as {
      id: string;
      name: string;
      env_default: boolean;
    }[],
  };
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

/**
 * Thread pro chat flutuante (dock): últimas mensagens com mídia ASSINADA
 * (bucket privado). RLS decide se o usuário pode ver o lead.
 */
export async function fetchThread(leadId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) return { error: error.message };
  const { signMessageMedia } = await import("@/lib/supabase/signed-media");
  const messages = await signMessageMedia(
    ((data ?? []) as { media_url: string | null }[]).slice().reverse()
  );
  return { messages };
}

/**
 * Contexto COMPLETO do lead pro chat flutuante (mesmos dados da página de
 * mensagens): lead + tags + dono, etapas, time, tarefas, notas, reuniões,
 * agendadas, respostas rápidas e status da conexão. RLS aplica em tudo.
 */
export async function fetchDockContext(leadId: string) {
  const supabase = await createClient();

  const { data: lead, error } = await supabase
    .from("leads")
    .select("*, tags:lead_tags(*), owner:profiles(*)")
    .eq("id", leadId)
    .maybeSingle();
  if (error || !lead) return { error: error?.message ?? "Lead não encontrado." };

  const pipelineId = (lead as { pipeline_id: string | null }).pipeline_id ?? "";
  const [stagesR, teamR, tasksR, notesR, meetingsR, schedR, qrR, statusR] =
    await Promise.all([
      supabase
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", pipelineId)
        .order("position"),
      supabase.from("profiles").select("*").eq("active", true),
      supabase
        .from("lead_tasks")
        .select("*, assignee:profiles!lead_tasks_assignee_id_fkey(name)")
        .eq("lead_id", leadId)
        .order("done")
        .order("due_date", { nullsFirst: false }),
      supabase
        .from("lead_notes")
        .select("*, author:profiles(name)")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false }),
      supabase
        .from("meetings")
        .select("*")
        .eq("lead_id", leadId)
        .order("starts_at", { ascending: true }),
      supabase
        .from("scheduled_messages")
        .select("*")
        .eq("lead_id", leadId)
        .eq("status", "pending")
        .order("send_at", { ascending: true }),
      supabase.from("quick_replies").select("*").order("position"),
      getStatus(),
    ]);

  const st = (statusR.data ?? {}) as { connected?: boolean; loggedIn?: boolean };
  return {
    context: {
      lead,
      stages: stagesR.data ?? [],
      team: teamR.data ?? [],
      tasks: tasksR.data ?? [],
      notes: notesR.data ?? [],
      meetings: meetingsR.data ?? [],
      scheduled: schedR.data ?? [],
    },
    quickReplies: qrR.data ?? [],
    connected: !!(statusR.ok && st.connected && st.loggedIn),
  };
}

/**
 * Nova conversa pelo chat flutuante: acha-ou-cria o lead pelo número
 * (mesma dedup canônica do webhook — número repetido volta o lead existente)
 * e devolve os dados pra abrir o chat na hora.
 */
export async function startConversation(input: { phone: string; name?: string }) {
  const { getProfile } = await import("@/lib/auth");
  const { onlyDigits } = await import("@/lib/services/whatsapp/dinastia");
  const profile = await getProfile();

  const digits = onlyDigits(input.phone);
  if (digits.length < 10) {
    return { error: "Número inválido — use DDD + número (ex.: 5511999998888)." };
  }

  const admin = createAdminClient();
  const { data: leadId, error } = await admin.rpc("wa_find_or_create_lead", {
    p_phone: digits,
    p_name: input.name?.trim() || "",
    p_sector: profile.sector,
  });
  if (error || !leadId) {
    return { error: error?.message ?? "Não foi possível criar o contato." };
  }

  // se veio nome e o lead existente está com nome = número, aproveita e batiza
  if (input.name?.trim()) {
    await admin
      .from("leads")
      .update({ name: input.name.trim() })
      .eq("id", leadId)
      .eq("name", digits);
  }

  const { data: lead } = await admin
    .from("leads")
    .select("id, name, phone, avatar_url")
    .eq("id", leadId)
    .maybeSingle();

  revalidatePath("/crm");
  return {
    lead: lead ?? {
      id: leadId as string,
      name: input.name?.trim() || digits,
      phone: digits,
      avatar_url: null,
    },
  };
}

/**
 * Histórico de movimentação do lead: trocas de etapa (lead_stage_history,
 * preenchido por trigger desde a Fase 1) + transferências de responsável.
 */
export async function fetchLeadHistory(leadId: string) {
  const supabase = await createClient();
  const [histR, transR, teamR] = await Promise.all([
    supabase
      .from("lead_stage_history")
      .select(
        "id, created_at, moved_by, from_stage:pipeline_stages!lead_stage_history_from_stage_id_fkey(name), to_stage:pipeline_stages!lead_stage_history_to_stage_id_fkey(name)"
      )
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("lead_transfers")
      .select("id, created_at, from_user, to_user")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("profiles").select("id, name"),
  ]);

  const names = new Map(
    ((teamR.data ?? []) as { id: string; name: string }[]).map((p) => [
      p.id,
      p.name,
    ])
  );
  const first = (id: string | null) =>
    id ? (names.get(id) ?? "").split(" ")[0] || null : null;

  type Ev = { id: string; at: string; text: string; by: string | null };
  const events: Ev[] = [];

  for (const h of (histR.data ?? []) as unknown as {
    id: number;
    created_at: string;
    moved_by: string | null;
    from_stage: { name: string } | null;
    to_stage: { name: string } | null;
  }[]) {
    events.push({
      id: `m${h.id}`,
      at: h.created_at,
      text: h.from_stage?.name
        ? `${h.from_stage.name} → ${h.to_stage?.name ?? "—"}`
        : `Entrou em ${h.to_stage?.name ?? "—"}`,
      by: first(h.moved_by) ?? "automação",
    });
  }
  for (const t of (transR.data ?? []) as {
    id: string;
    created_at: string;
    from_user: string | null;
    to_user: string | null;
  }[]) {
    events.push({
      id: `t${t.id}`,
      at: t.created_at,
      text: `Transferido${t.from_user ? ` de ${first(t.from_user)}` : ""} para ${
        first(t.to_user) ?? "—"
      }`,
      by: null,
    });
  }

  events.sort((a, b) => (a.at < b.at ? 1 : -1));
  return { events: events.slice(0, 40) };
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

/**
 * Exclui a CONVERSA: apaga todas as mensagens (e as mídias do storage).
 * Se o contato estiver fora do funil (sem card), remove o contato também.
 * Só admin/gestor.
 */
export async function deleteConversation(leadId: string) {
  const { getProfile } = await import("@/lib/auth");
  const { can } = await import("@/lib/permissions");
  const profile = await getProfile();
  if (!can.deleteLead(profile.role)) {
    return { error: "Sem permissão para excluir conversas." };
  }

  const admin = createAdminClient();

  // mídias do chat no storage (ficam em <leadId>/*)
  try {
    const { data: files } = await admin.storage
      .from("whatsapp-media")
      .list(leadId, { limit: 500 });
    if (files?.length) {
      await admin.storage
        .from("whatsapp-media")
        .remove(files.map((f) => `${leadId}/${f.name}`));
    }
  } catch {
    // mídia órfã não bloqueia a exclusão
  }

  const { error } = await admin
    .from("whatsapp_messages")
    .delete()
    .eq("lead_id", leadId);
  if (error) return { error: error.message };

  // contato só-chat (sem card) some junto; com card, o card sobrevive
  const { data: lead } = await admin
    .from("leads")
    .select("pipeline_id")
    .eq("id", leadId)
    .maybeSingle();
  let contactDeleted = false;
  if (lead && !lead.pipeline_id) {
    await admin.from("leads").delete().eq("id", leadId);
    contactDeleted = true;
  }

  revalidatePath("/chat");
  revalidatePath("/crm");
  return { ok: true, contactDeleted };
}

// ---------- Configurações do número (chat) ----------

export type ChatSettings = { signature: boolean; auto_create_card: boolean };

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
  };
}

export async function updateChatSettings(patch: Partial<ChatSettings>) {
  const supabase = await createClient();
  const current = await getChatSettings();
  const next = { ...current, ...patch };
  // RLS: só admin/gestor consegue gravar
  const { error } = await supabase
    .from("org_settings")
    .upsert({ key: "chat", value: next, updated_at: new Date().toISOString() });
  if (error) return { error: error.message };
  return { ok: true, settings: next };
}

/** Marca TODAS as conversas como lidas (a RLS limita ao que o usuário vê). */
export async function markAllConversationsRead() {
  const supabase = await createClient();
  // captura o que está não-lido ANTES de carimbar, pra confirmar no WhatsApp
  const { data: unread } = await supabase
    .from("whatsapp_messages")
    .select("provider_msg_id, lead:leads(phone)")
    .eq("direction", "in")
    .is("read_at", null)
    .not("provider_msg_id", "is", null)
    .limit(500);

  const { error } = await supabase
    .from("whatsapp_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("direction", "in")
    .is("read_at", null);
  if (error) return { error: error.message };

  // espelha a leitura no WhatsApp real (some a notificação do celular)
  const byPhone = new Map<string, string[]>();
  for (const m of (unread ?? []) as unknown as {
    provider_msg_id: string | null;
    lead: { phone: string | null } | null;
  }[]) {
    if (!m.provider_msg_id || !m.lead?.phone) continue;
    if (!byPhone.has(m.lead.phone)) byPhone.set(m.lead.phone, []);
    byPhone.get(m.lead.phone)!.push(m.provider_msg_id);
  }
  for (const [phone, ids] of [...byPhone.entries()].slice(0, 30)) {
    await markChatRead(phone, ids);
  }

  revalidatePath("/crm/mensagens");
  return { ok: true };
}

export async function markConversationRead(leadId: string) {
  const supabase = await createClient();
  const [{ data: lead }, { data: unread }] = await Promise.all([
    supabase.from("leads").select("phone").eq("id", leadId).maybeSingle(),
    supabase
      .from("whatsapp_messages")
      .select("provider_msg_id")
      .eq("lead_id", leadId)
      .eq("direction", "in")
      .is("read_at", null)
      .not("provider_msg_id", "is", null)
      .limit(200),
  ]);

  const { error } = await supabase
    .from("whatsapp_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("lead_id", leadId)
    .eq("direction", "in")
    .is("read_at", null);
  if (error) return { error: error.message };

  // espelha a leitura no WhatsApp real (some a notificação do celular)
  const phone = (lead as { phone: string | null } | null)?.phone;
  const ids = ((unread ?? []) as { provider_msg_id: string | null }[])
    .map((m) => m.provider_msg_id)
    .filter((id): id is string => !!id);
  if (phone && ids.length > 0) {
    const { token: authToken } = await resolveLeadNumber(leadId);
    await markChatRead(phone, ids, authToken);
  }

  revalidatePath("/crm/mensagens");
  return { ok: true };
}

/**
 * Marca a conversa como NÃO lida (volta o badge): reabre a última mensagem
 * recebida. Ao abrir a conversa de novo, ela é lida normalmente.
 */
export async function markConversationUnread(leadId: string) {
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("lead_id", leadId)
    .eq("direction", "in")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const id = (last as { id: string } | null)?.id;
  if (!id) return { error: "Conversa sem mensagens recebidas." };
  const { error } = await supabase
    .from("whatsapp_messages")
    .update({ read_at: null })
    .eq("id", id);
  if (error) return { error: error.message };
  return { ok: true };
}

/** Apaga a mensagem PRA TODOS (some no celular do contato também). */
export async function deleteMessageForAll(
  leadId: string,
  providerMsgId: string
) {
  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("phone")
    .eq("id", leadId)
    .maybeSingle();
  const phone = (lead as { phone: string | null } | null)?.phone;
  if (!phone) return { error: "Lead sem telefone." };

  const { token: authToken } = await resolveLeadNumber(leadId);
  const r = await revokeMessage(phone, providerMsgId, authToken);
  if (!r.ok) return { error: r.error ?? "Falha ao apagar no WhatsApp." };

  const { error } = await supabase
    .from("whatsapp_messages")
    .update({
      body: "(mensagem apagada)",
      media_url: null,
      media_type: null,
      reply_to_body: null,
      reply_to_dir: null,
    })
    .eq("lead_id", leadId)
    .eq("provider_msg_id", providerMsgId);
  if (error) return { error: error.message };
  revalidatePath("/crm/mensagens");
  return { ok: true };
}

/** Edita uma mensagem enviada (janela de ~15 min do WhatsApp). */
export async function editWhatsappMessage(
  leadId: string,
  providerMsgId: string,
  newBody: string
) {
  const text = newBody.trim();
  if (!text) return { error: "Mensagem não pode ficar vazia." };
  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("phone")
    .eq("id", leadId)
    .maybeSingle();
  const phone = (lead as { phone: string | null } | null)?.phone;
  if (!phone) return { error: "Lead sem telefone." };

  const { token: authToken } = await resolveLeadNumber(leadId);
  const r = await editTextMessage(phone, providerMsgId, text, authToken);
  if (!r.ok) return { error: r.error ?? "Falha ao editar no WhatsApp." };

  const { error } = await supabase
    .from("whatsapp_messages")
    .update({ body: text })
    .eq("lead_id", leadId)
    .eq("provider_msg_id", providerMsgId);
  if (error) return { error: error.message };
  revalidatePath("/crm/mensagens");
  return { ok: true };
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
