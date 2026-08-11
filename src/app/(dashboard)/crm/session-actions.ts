"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can, NOT_ALLOWED } from "@/lib/permissions";
import {
  claimSession,
  pauseSession,
  resumeSession,
  closeSession,
  getOpenSessionForLead,
} from "@/lib/chat-sessions/lifecycle";
import type {
  ChatQueue,
  ChatQueueMode,
  InboxSessionRow,
  QueueTab,
  SessionMetrics,
  SessionMetricsScope,
} from "@/lib/chat-sessions/types";
import type { BusinessHours } from "@/lib/chat-sessions/business-hours";
import type { Sector } from "@/lib/types";

function revalidateChat() {
  revalidatePath("/chat");
  revalidatePath("/crm");
}

export async function getOpenSession(leadId: string) {
  await getProfile();
  const supabase = await createClient();
  const session = await getOpenSessionForLead(supabase, leadId);
  return { session };
}

export async function listQueueSessions(tab: QueueTab = "waiting") {
  await getProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("inbox_sessions", {
    p_tab: tab,
  });
  if (error) return { error: error.message, sessions: [] as InboxSessionRow[] };
  return { sessions: (data ?? []) as InboxSessionRow[] };
}

export async function claimChatSession(sessionId: string) {
  const profile = await getProfile();
  const supabase = await createClient();
  const r = await claimSession(supabase, sessionId, profile.id);
  if ("error" in r) return r;
  revalidateChat();
  return { ok: true as const };
}

export async function pauseChatSession(sessionId: string, reason?: string) {
  const profile = await getProfile();
  const supabase = await createClient();
  const r = await pauseSession(supabase, sessionId, profile.id, reason);
  if ("error" in r) return r;
  revalidateChat();
  return { ok: true as const };
}

export async function resumeChatSession(sessionId: string) {
  const profile = await getProfile();
  const supabase = await createClient();
  const r = await resumeSession(supabase, sessionId, profile.id);
  if ("error" in r) return r;
  revalidateChat();
  return { ok: true as const };
}

export async function closeChatSession(sessionId: string, reason?: string) {
  const profile = await getProfile();
  const supabase = await createClient();
  const r = await closeSession(supabase, sessionId, profile.id, reason);
  if ("error" in r) return r;
  revalidateChat();
  return { ok: true as const };
}

export async function setAgentPresenceStatus(
  status: "online" | "busy" | "away" | "offline"
) {
  const profile = await getProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("agent_presence").upsert({
    user_id: profile.id,
    status,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  return { ok: true as const };
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

export async function getSessionMetrics(opts: {
  scope: SessionMetricsScope;
  rangeDays: number;
  numberId?: string | null;
}): Promise<{ metrics: SessionMetrics } | { error: string }> {
  const profile = await getProfile();
  if (opts.scope === "team" && !can.viewReports(profile.role)) {
    return { error: NOT_ALLOWED };
  }
  const supabase = await createClient();
  const days = Math.min(Math.max(opts.rangeDays || 7, 1), 90);
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const me = profile.id;

  let q = supabase
    .from("chat_sessions")
    .select(
      "id, status, assignee_id, queue_id, number_id, created_at, assigned_at, closed_at, wait_seconds, handle_seconds, lead_id, leads(sector)"
    );
  if (opts.scope === "me") {
    q = q.or(
      `assignee_id.eq.${me},and(status.eq.waiting,assignee_id.is.null)`
    );
  }
  if (opts.numberId) {
    q = q.eq("number_id", opts.numberId);
  }

  const { data, error } = await q;
  if (error) return { error: error.message };
  const rows = (data ?? []) as {
    id: string;
    status: string;
    assignee_id: string | null;
    number_id: string | null;
    created_at: string;
    assigned_at: string | null;
    closed_at: string | null;
    wait_seconds: number | null;
    handle_seconds: number | null;
    lead_id: string;
    leads: { sector: string } | { sector: string }[] | null;
  }[];

  const open = rows.filter((r) => r.status !== "closed");
  const waiting = open.filter((r) => r.status === "waiting");
  const active = open.filter((r) => r.status === "active");
  const paused = open.filter((r) => r.status === "paused");
  const waitingForMe =
    opts.scope === "me"
      ? waiting.length
      : waiting.filter((r) => !r.assignee_id).length;
  const closedInRange = rows.filter(
    (r) => r.status === "closed" && r.closed_at && r.closed_at >= since
  );
  const startedInRange = rows.filter((r) => r.created_at >= since);

  const waitSecs = waiting
    .map((r) =>
      Math.max(0, Math.floor((Date.now() - new Date(r.created_at).getTime()) / 1000))
    )
    .concat(
      closedInRange
        .map((r) => r.wait_seconds)
        .filter((n): n is number => typeof n === "number")
    );
  const handleSecs = closedInRange
    .map((r) => r.handle_seconds)
    .filter((n): n is number => typeof n === "number");

  const leadIds = [...new Set(open.map((r) => r.lead_id))];
  let unread = 0;
  if (leadIds.length) {
    const { count } = await supabase
      .from("whatsapp_messages")
      .select("id", { count: "exact", head: true })
      .eq("direction", "in")
      .is("read_at", null)
      .in("lead_id", leadIds);
    unread = count ?? 0;
  }

  // SLA: first response within queue default 300s when wait_seconds present
  const withWait = closedInRange.filter(
    (r) => typeof r.wait_seconds === "number"
  );
  const onTime = withWait.filter((r) => (r.wait_seconds as number) <= 300);
  const slaPct = withWait.length
    ? Math.round((onTime.length / withWait.length) * 1000) / 10
    : null;

  const agentMap = new Map<string, number>();
  for (const r of [...active, ...closedInRange]) {
    if (!r.assignee_id) continue;
    agentMap.set(r.assignee_id, (agentMap.get(r.assignee_id) ?? 0) + 1);
  }
  const agentIds = [...agentMap.keys()];
  let byAgent: SessionMetrics["by_agent"] = [];
  if (agentIds.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", agentIds);
    byAgent = (profiles ?? []).map((p) => ({
      user_id: p.id as string,
      name: (p.name as string) || "—",
      count: agentMap.get(p.id as string) ?? 0,
    }));
    byAgent.sort((a, b) => b.count - a.count);
  }

  const sectorMap = new Map<string, number>();
  for (const r of open) {
    const lead = Array.isArray(r.leads) ? r.leads[0] : r.leads;
    const sector = lead?.sector ?? "sem_setor";
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + 1);
  }
  const bySector = [...sectorMap.entries()].map(([sector, count]) => ({
    sector,
    count,
  }));

  const { data: presenceRows } = await supabase
    .from("agent_presence")
    .select("status");
  const presenceList = presenceRows ?? [];
  const online = presenceList.filter((p) =>
    ["online", "busy"].includes(String(p.status))
  ).length;
  const offline = Math.max(0, presenceList.length - online);

  const metrics: SessionMetrics = {
    range_days: days,
    waiting: waiting.length,
    waiting_for_me: waitingForMe,
    active: active.length,
    paused: paused.length,
    closed_in_range: closedInRange.length,
    started_in_range: startedInRange.length,
    unread,
    unassigned: waiting.filter((r) => !r.assignee_id).length,
    avg_wait_seconds: avg(waitSecs),
    max_wait_seconds: waitSecs.length ? Math.max(...waitSecs) : null,
    avg_handle_seconds: avg(handleSecs),
    sla_on_time_pct: slaPct,
    csat_avg: null,
    by_agent: byAgent,
    by_sector: bySector,
    presence: { online, offline },
  };
  return { metrics };
}

export type QueueRow = ChatQueue & {
  business_hours: BusinessHours | null;
};

export async function listQueues() {
  await getProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_queues")
    .select(
      "id, name, sector, mode, sla_first_response_seconds, sla_resolution_seconds, csat_enabled, csat_delay_seconds, vip_bypass, active, business_hours"
    )
    .order("name");
  if (error) return { error: error.message, queues: [] as QueueRow[] };
  return { queues: (data ?? []) as QueueRow[] };
}

export async function createQueue(input: {
  name: string;
  sector?: Sector | null;
  mode?: ChatQueueMode;
}) {
  const profile = await getProfile();
  if (!can.configurePipelines(profile.role)) return { error: NOT_ALLOWED };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_queues")
    .insert({
      name: input.name.trim(),
      sector: input.sector ?? null,
      mode: input.mode ?? "pull",
    })
    .select(
      "id, name, sector, mode, sla_first_response_seconds, sla_resolution_seconds, csat_enabled, csat_delay_seconds, vip_bypass, active, business_hours"
    )
    .single();
  if (error) return { error: error.message };
  revalidateChat();
  return { queue: data as QueueRow };
}

export async function updateQueue(
  id: string,
  patch: Partial<{
    name: string;
    sector: Sector | null;
    mode: ChatQueueMode;
    sla_first_response_seconds: number;
    sla_resolution_seconds: number | null;
    csat_enabled: boolean;
    csat_delay_seconds: number;
    vip_bypass: boolean;
    active: boolean;
    business_hours: BusinessHours;
  }>
) {
  const profile = await getProfile();
  if (!can.configurePipelines(profile.role)) return { error: NOT_ALLOWED };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_queues")
    .update(patch)
    .eq("id", id)
    .select(
      "id, name, sector, mode, sla_first_response_seconds, sla_resolution_seconds, csat_enabled, csat_delay_seconds, vip_bypass, active, business_hours"
    )
    .single();
  if (error) return { error: error.message };
  revalidateChat();
  return { queue: data as QueueRow };
}

export async function deactivateQueue(id: string) {
  return updateQueue(id, { active: false });
}
