import type { SupabaseClient } from "@supabase/supabase-js";
import { sessionsEnabled, vipStageNames } from "@/lib/chat-sessions/settings";
import type { ChatQueue, ChatSessionStatus } from "@/lib/chat-sessions/types";
import { tryAcAssign } from "@/lib/chat-sessions/acd";

export type EnsureSessionResult = {
  sessionId: string | null;
  created: boolean;
  routing: string | null;
};

/**
 * Garante sessão aberta para o lead (só se sessions_enabled).
 * - Inbound: cria se não houver (VIP ou fila).
 * - Outbound: só anexa se já existir sessão aberta (não abre sozinho).
 */
export async function ensureActiveSession(
  admin: SupabaseClient,
  opts: {
    leadId: string;
    numberId: string | null;
    direction: "in" | "out";
  }
): Promise<EnsureSessionResult> {
  if (!(await sessionsEnabled(admin))) {
    return { sessionId: null, created: false, routing: null };
  }

  const { data: open } = await admin
    .from("chat_sessions")
    .select("id, status, routing_reason")
    .eq("lead_id", opts.leadId)
    .in("status", ["waiting", "active", "paused"])
    .maybeSingle();

  if (open?.id) {
    return {
      sessionId: open.id as string,
      created: false,
      routing: (open.routing_reason as string) ?? null,
    };
  }

  // Outbound sem sessão aberta: não cria (timeline CRM pura)
  if (opts.direction === "out") {
    return { sessionId: null, created: false, routing: null };
  }

  const plan = await planNewSession(admin, opts.leadId);

  const { data: sessionId, error } = await admin.rpc(
    "ensure_open_chat_session",
    {
      p_lead_id: opts.leadId,
      p_queue_id: plan.queueId,
      p_number_id: opts.numberId,
      p_opened_by: plan.openedBy,
      p_assignee_id: plan.assigneeId,
      p_status: plan.status,
      p_routing_reason: plan.routingReason,
    }
  );

  if (error || !sessionId) {
    console.log("[sessions] ensure_open falhou:", error?.message);
    return { sessionId: null, created: false, routing: null };
  }

  const id = String(sessionId);

  if (plan.status === "waiting" && plan.queueMode === "acd") {
    try {
      await tryAcAssign(admin, id, plan.queueId);
    } catch (e) {
      console.log("[sessions] ACD falhou:", (e as Error).message);
    }
  }

  return { sessionId: id, created: true, routing: plan.routingReason };
}

async function planNewSession(
  admin: SupabaseClient,
  leadId: string
): Promise<{
  queueId: string | null;
  assigneeId: string | null;
  status: ChatSessionStatus;
  openedBy: "inbound" | "vip";
  routingReason: string;
  queueMode: "pull" | "acd";
}> {
  const { data: lead } = await admin
    .from("leads")
    .select("id, sector, owner_id, stage_id")
    .eq("id", leadId)
    .maybeSingle();

  const sector = (lead as { sector?: string } | null)?.sector ?? "vendas";
  const ownerId = (lead as { owner_id?: string | null } | null)?.owner_id ?? null;
  const stageId = (lead as { stage_id?: string | null } | null)?.stage_id ?? null;

  let stageName: string | null = null;
  if (stageId) {
    const { data: st } = await admin
      .from("pipeline_stages")
      .select("name")
      .eq("id", stageId)
      .maybeSingle();
    stageName = (st as { name?: string } | null)?.name ?? null;
  }

  const vipNames = await vipStageNames(admin);
  const isVip =
    !!stageName &&
    vipNames.some((n) => n.toLowerCase() === stageName!.toLowerCase());

  const queue = await resolveQueue(admin, sector);

  if (isVip && ownerId && (queue?.vip_bypass !== false)) {
    return {
      queueId: queue?.id ?? null,
      assigneeId: ownerId,
      status: "active",
      openedBy: "vip",
      routingReason: "vip_deal",
      queueMode: queue?.mode ?? "pull",
    };
  }

  return {
    queueId: queue?.id ?? null,
    assigneeId: null,
    status: "waiting",
    openedBy: "inbound",
    routingReason: "queue",
    queueMode: queue?.mode ?? "pull",
  };
}

async function resolveQueue(
  admin: SupabaseClient,
  sector: string
): Promise<ChatQueue | null> {
  const { data } = await admin
    .from("chat_queues")
    .select(
      "id, name, sector, mode, sla_first_response_seconds, sla_resolution_seconds, csat_enabled, csat_delay_seconds, vip_bypass, active"
    )
    .eq("active", true)
    .eq("sector", sector)
    .limit(1)
    .maybeSingle();
  if (data) return data as ChatQueue;

  const { data: anyQ } = await admin
    .from("chat_queues")
    .select(
      "id, name, sector, mode, sla_first_response_seconds, sla_resolution_seconds, csat_enabled, csat_delay_seconds, vip_bypass, active"
    )
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  return (anyQ as ChatQueue) ?? null;
}
