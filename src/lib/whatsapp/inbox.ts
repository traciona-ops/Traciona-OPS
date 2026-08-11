import type { SupabaseClient } from "@supabase/supabase-js";
import { getStatus, markChatRead, onlyDigits } from "@/lib/services/whatsapp/dinastia";
import { resolveLeadNumber } from "@/lib/services/whatsapp/numbers";
import type { Sector } from "@/lib/types";

export async function fetchInboxConversationsDomain(db: SupabaseClient) {
  const { data, error } = await db.rpc("inbox_conversations");
  if (error) return { error: error.message };
  return { conversations: data ?? [] };
}

export async function listChatNumbersDomain(admin: SupabaseClient) {
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

export async function fetchThreadDomain(db: SupabaseClient, leadId: string) {
  const { data, error } = await db
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

export async function fetchDockContextDomain(
  db: SupabaseClient,
  leadId: string
) {
  const { data: lead, error } = await db
    .from("leads")
    .select("*, tags:lead_tags(*), owner:profiles(*)")
    .eq("id", leadId)
    .maybeSingle();
  if (error || !lead) return { error: error?.message ?? "Lead não encontrado." };

  const pipelineId = (lead as { pipeline_id: string | null }).pipeline_id ?? "";
  const [stagesR, teamR, tasksR, notesR, meetingsR, schedR, qrR, statusR] =
    await Promise.all([
      db
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", pipelineId)
        .order("position"),
      db.from("profiles").select("*").eq("active", true),
      db
        .from("lead_tasks")
        .select("*, assignee:profiles!lead_tasks_assignee_id_fkey(name)")
        .eq("lead_id", leadId)
        .order("done")
        .order("due_date", { nullsFirst: false }),
      db
        .from("lead_notes")
        .select("*, author:profiles(name)")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false }),
      db
        .from("meetings")
        .select("*")
        .eq("lead_id", leadId)
        .order("starts_at", { ascending: true }),
      db
        .from("scheduled_messages")
        .select("*")
        .eq("lead_id", leadId)
        .eq("status", "pending")
        .order("send_at", { ascending: true }),
      db.from("quick_replies").select("*").order("position"),
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
 * RPC exige service_role. Depois: só user client — se o lead for invisível
 * ao RLS (outro setor / outro dono), erro genérico sem PII.
 */
export async function startConversationDomain(
  db: SupabaseClient,
  admin: SupabaseClient,
  input: { phone: string; name?: string; sector: Sector }
) {
  const digits = onlyDigits(input.phone);
  if (digits.length < 10) {
    return { error: "Número inválido — use DDD + número (ex.: 5511999998888)." };
  }

  const { data: leadId, error } = await admin.rpc("wa_find_or_create_lead", {
    p_phone: digits,
    p_name: input.name?.trim() || "",
    p_sector: input.sector,
  });
  if (error || !leadId) {
    return { error: error?.message ?? "Não foi possível criar o contato." };
  }

  const name = input.name?.trim();
  // RLS bloqueia update se o lead for de outro setor/dono
  if (name) {
    await db
      .from("leads")
      .update({ name })
      .eq("id", leadId)
      .eq("name", digits);
  }

  const { data: lead } = await db
    .from("leads")
    .select("id, name, phone, avatar_url")
    .eq("id", leadId)
    .maybeSingle();

  if (!lead) {
    return { error: "Não foi possível abrir a conversa." };
  }

  return { lead };
}

export async function fetchLeadHistoryDomain(
  db: SupabaseClient,
  leadId: string
) {
  const [histR, transR, teamR] = await Promise.all([
    db
      .from("lead_stage_history")
      .select(
        "id, created_at, moved_by, from_stage:pipeline_stages!lead_stage_history_from_stage_id_fkey(name), to_stage:pipeline_stages!lead_stage_history_to_stage_id_fkey(name)"
      )
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(30),
    db
      .from("lead_transfers")
      .select("id, created_at, from_user, to_user")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(20),
    db.from("profiles").select("id, name"),
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

/**
 * User select lead first (RLS gate). Admin só storage media delete.
 * User client pra message/lead deletes.
 */
export async function deleteConversationDomain(
  db: SupabaseClient,
  admin: SupabaseClient,
  leadId: string
) {
  const { data: lead } = await db
    .from("leads")
    .select("id, pipeline_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) {
    return { error: "Conversa não encontrada." };
  }

  // storage privado exige service role; admin só aqui
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

  const { error } = await db
    .from("whatsapp_messages")
    .delete()
    .eq("lead_id", leadId);
  if (error) return { error: error.message };

  // contato só-chat (sem card) some junto; com card, o card sobrevive
  let contactDeleted = false;
  if (!lead.pipeline_id) {
    const { error: delErr } = await db.from("leads").delete().eq("id", leadId);
    if (delErr) return { error: delErr.message };
    contactDeleted = true;
  }

  return { ok: true as const, contactDeleted };
}

export async function markAllConversationsReadDomain(db: SupabaseClient) {
  // captura o que está não-lido ANTES de carimbar, pra confirmar no WhatsApp
  const { data: unread } = await db
    .from("whatsapp_messages")
    .select("provider_msg_id, lead:leads(phone)")
    .eq("direction", "in")
    .is("read_at", null)
    .not("provider_msg_id", "is", null)
    .limit(500);

  const { error } = await db
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

  return { ok: true as const };
}

export async function markConversationReadDomain(
  db: SupabaseClient,
  leadId: string
) {
  const [{ data: lead }, { data: unread }] = await Promise.all([
    db.from("leads").select("phone").eq("id", leadId).maybeSingle(),
    db
      .from("whatsapp_messages")
      .select("provider_msg_id")
      .eq("lead_id", leadId)
      .eq("direction", "in")
      .is("read_at", null)
      .not("provider_msg_id", "is", null)
      .limit(200),
  ]);

  const { error } = await db
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

  return { ok: true as const };
}

export async function markConversationUnreadDomain(
  db: SupabaseClient,
  leadId: string
) {
  const { data: last } = await db
    .from("whatsapp_messages")
    .select("id")
    .eq("lead_id", leadId)
    .eq("direction", "in")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const id = (last as { id: string } | null)?.id;
  if (!id) return { error: "Conversa sem mensagens recebidas." };
  const { error } = await db
    .from("whatsapp_messages")
    .update({ read_at: null })
    .eq("id", id);
  if (error) return { error: error.message };
  return { ok: true as const };
}
