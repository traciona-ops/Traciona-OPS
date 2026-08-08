import type { SupabaseClient } from "@supabase/supabase-js";

// Motor de automações. Rodado por:
//   * webhook  → gatilho 'reply_received' (evento, na hora)
//   * cron     → 'stale_days' / 'no_reply_days' / 'enter_stage' (a cada minuto)
// Ações:
//   * move_stage   → move o card (idempotente por natureza)
//   * send_message → agenda mensagem via scheduled_messages (o dispatch do
//     cron envia com retry). Trava automation_runs garante 1 disparo por
//     lead por automação — sem ela, gatilho de estado repetiria a cada tick.
// Sempre com o admin client (bypassa RLS). Nunca deve quebrar quem chama.

type Admin = SupabaseClient;

const DAY_MS = 86_400_000;

interface AutomationRow {
  id: string;
  pipeline_id: string;
  stage_id: string | null;
  name: string | null;
  trigger: string;
  trigger_days: number | null;
  action: string;
  to_stage_id: string | null;
  message_body: string | null;
  active: boolean;
}

interface LeadRow {
  id: string;
  name?: string | null;
  phone?: string | null;
  stage_id: string | null;
  pipeline_id: string | null;
  stage_changed_at?: string | null;
}

/**
 * Anti-ban: mensagem automática só sai em horário comercial (8h–20h BR).
 * Fora da janela, agenda pras 8h+jitter do próximo dia útil de envio.
 */
function businessSendAt(): string {
  const now = new Date();
  // hora no fuso BR (BRT = UTC-3, sem DST desde 2019)
  const brHour = (now.getUTCHours() + 24 - 3) % 24;
  const jitterMs = Math.floor(Math.random() * 5 * 60_000); // 0–5 min
  if (brHour >= 8 && brHour < 20) {
    return new Date(now.getTime() + jitterMs).toISOString();
  }
  // próximo dia às 8h BR = 11h UTC (se ainda é madrugada de hoje, hoje mesmo)
  const next = new Date(now);
  if (brHour >= 20) next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(11, 0, 0, 0);
  return new Date(next.getTime() + jitterMs).toISOString();
}

function renderTemplate(tpl: string, lead: LeadRow): string {
  const first = (lead.name ?? "").split(" ")[0] || "tudo bem";
  const brHour = (new Date().getUTCHours() + 24 - 3) % 24;
  const saud = brHour < 12 ? "Bom dia" : brHour < 18 ? "Boa tarde" : "Boa noite";
  return tpl.replace(/\{nome\}/gi, first).replace(/\{saudacao\}/gi, saud);
}

/**
 * Trava de disparo único: tenta registrar (automation, lead) em
 * automation_runs. Se já existia, retorna false (não dispara de novo).
 */
async function claimRun(
  admin: Admin,
  automationId: string,
  leadId: string
): Promise<boolean> {
  const { error } = await admin
    .from("automation_runs")
    .insert({ automation_id: automationId, lead_id: leadId });
  if (!error) return true;
  return false; // duplicado (23505) ou erro → não dispara
}

/** Move o lead pra etapa destino. Retorna true se moveu de verdade. */
async function actionMoveStage(
  admin: Admin,
  lead: LeadRow,
  a: AutomationRow,
  msgId?: string | null
): Promise<boolean> {
  if (!a.to_stage_id || lead.stage_id === a.to_stage_id) return false;

  const { data: dest } = await admin
    .from("pipeline_stages")
    .select("pipeline_id, name")
    .eq("id", a.to_stage_id)
    .maybeSingle();
  if (!dest) return false;

  const { data: top } = await admin
    .from("leads")
    .select("position")
    .eq("stage_id", a.to_stage_id)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  const position = top ? (top.position as number) - 1 : 0;

  const { error } = await admin
    .from("leads")
    .update({
      stage_id: a.to_stage_id,
      pipeline_id: dest.pipeline_id,
      stage_changed_at: new Date().toISOString(),
      position,
    })
    .eq("id", lead.id);
  if (error) return false;

  // Idempotency: check if note for this msgId already exists
  if (msgId) {
    const { data: existing } = await admin
      .from("lead_notes")
      .select("id")
      .eq("lead_id", lead.id)
      .like("content", `%${msgId}%`)
      .limit(1)
      .maybeSingle();
    if (existing) return true; // Already noted, skip insert
  }

  await admin.from("lead_notes").insert({
    lead_id: lead.id,
    author_id: null,
    content: `Automação${a.name ? ` "${a.name}"` : ""}: card movido para "${dest.name}".${msgId ? ` [${msgId}]` : ""}`,
  });
  return true;
}

/**
 * Agenda a mensagem automática (o dispatch do cron envia com retry).
 * 1 disparo por lead por automação (automation_runs).
 */
async function actionSendMessage(
  admin: Admin,
  lead: LeadRow,
  a: AutomationRow,
  msgId?: string | null
): Promise<boolean> {
  if (!a.message_body?.trim()) return false;

  // telefone pode não ter vindo na row — busca se precisar
  let phone = lead.phone;
  let name = lead.name;
  if (phone === undefined || name === undefined) {
    const { data } = await admin
      .from("leads")
      .select("phone, name")
      .eq("id", lead.id)
      .maybeSingle();
    phone = data?.phone ?? null;
    name = data?.name ?? null;
  }
  if (!phone) return false;

  if (!(await claimRun(admin, a.id, lead.id))) return false;

  const body = renderTemplate(a.message_body, { ...lead, name });
  const { error } = await admin.from("scheduled_messages").insert({
    lead_id: lead.id,
    body,
    send_at: businessSendAt(),
    status: "pending",
    created_by: null,
  });
  if (error) return false;

  // Idempotency: check if note for this msgId already exists
  if (msgId) {
    const { data: existing } = await admin
      .from("lead_notes")
      .select("id")
      .eq("lead_id", lead.id)
      .like("content", `%${msgId}%`)
      .limit(1)
      .maybeSingle();
    if (existing) return true; // Already noted, skip insert
  }

  await admin.from("lead_notes").insert({
    lead_id: lead.id,
    author_id: null,
    content: `Automação${a.name ? ` "${a.name}"` : ""}: mensagem automática programada.${msgId ? ` [${msgId}]` : ""}`,
  });
  return true;
}

async function applyAutomation(
  admin: Admin,
  lead: LeadRow,
  a: AutomationRow,
  msgId?: string | null
): Promise<boolean> {
  if (a.action === "send_message") return actionSendMessage(admin, lead, a, msgId);
  if (a.action === "move_stage") return actionMoveStage(admin, lead, a, msgId);
  return false;
}

/**
 * Gatilho de EVENTO: chamado quando chega mensagem do cliente (in).
 * msgId: opcional, para rastreabilidade e idempotência em lead_notes.
 */
export async function runReplyAutomations(
  admin: Admin,
  leadId: string,
  msgId?: string | null
): Promise<void> {
  const { data: lead } = await admin
    .from("leads")
    .select("id, name, phone, stage_id, pipeline_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead?.stage_id || !lead.pipeline_id) return;

  const { data: autos } = await admin
    .from("automations")
    .select("*")
    .eq("active", true)
    .eq("trigger", "reply_received")
    .or(
      `stage_id.eq.${lead.stage_id},and(stage_id.is.null,pipeline_id.eq.${lead.pipeline_id})`
    );

  for (const a of (autos ?? []) as AutomationRow[]) {
    const acted = await applyAutomation(admin, lead as LeadRow, a, msgId);
    if (acted && a.action === "move_stage") break; // etapa mudou; para
  }
}

/**
 * Gatilhos varridos pelo cron. Retorna quantas ações executou.
 *   stale_days     → parado há N dias na etapa
 *   no_reply_days  → sem mensagem 'in' há N dias (e há N dias na etapa)
 *   enter_stage    → está na etapa (com a trava de 1x por lead)
 */
export async function runTimeAutomations(admin: Admin): Promise<number> {
  const { data: autos } = await admin
    .from("automations")
    .select("*")
    .eq("active", true)
    .in("trigger", ["stale_days", "no_reply_days", "enter_stage"]);

  let acted = 0;

  for (const a of (autos ?? []) as AutomationRow[]) {
    if (!a.stage_id) continue;
    const days = a.trigger_days ?? 0;
    const needsDays = a.trigger === "stale_days" || a.trigger === "no_reply_days";
    if (needsDays && days <= 0) continue;
    if (a.action === "move_stage" && !a.to_stage_id) continue;

    const cutoff = needsDays
      ? new Date(Date.now() - days * DAY_MS).toISOString()
      : null;

    let query = admin
      .from("leads")
      .select("id, name, phone, stage_id, pipeline_id, stage_changed_at")
      .eq("stage_id", a.stage_id)
      .limit(500);
    if (cutoff) query = query.lte("stage_changed_at", cutoff);
    const { data: leads } = await query;
    if (!leads?.length) continue;

    let candidates = leads as LeadRow[];

    if (a.trigger === "no_reply_days" && candidates.length && cutoff) {
      const ids = candidates.map((l) => l.id);
      const { data: replied } = await admin
        .from("whatsapp_messages")
        .select("lead_id")
        .eq("direction", "in")
        .gt("created_at", cutoff)
        .in("lead_id", ids);
      const repliedSet = new Set(
        (replied ?? []).map((r) => (r as { lead_id: string }).lead_id)
      );
      candidates = candidates.filter((l) => !repliedSet.has(l.id));
    }

    for (const l of candidates) {
      if (await applyAutomation(admin, l, a)) acted++;
    }
  }

  return acted;
}
