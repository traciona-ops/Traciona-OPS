import type { SupabaseClient } from "@supabase/supabase-js";
import {
  businessSeconds,
  type BusinessHours,
} from "@/lib/chat-sessions/business-hours";
import type { ChatSession } from "@/lib/chat-sessions/types";

async function appendEvent(
  db: SupabaseClient,
  sessionId: string,
  kind: string,
  actorId: string | null,
  payload: Record<string, unknown> = {}
) {
  await db.from("chat_session_events").insert({
    session_id: sessionId,
    kind,
    actor_id: actorId,
    payload,
  });
}

export async function claimSession(
  db: SupabaseClient,
  sessionId: string,
  userId: string
): Promise<{ ok: true } | { error: string }> {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("chat_sessions")
    .update({
      status: "active",
      assignee_id: userId,
      assigned_at: now,
    })
    .eq("id", sessionId)
    .eq("status", "waiting")
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Sessão não está aguardando ou já foi assumida." };

  await appendEvent(db, sessionId, "assigned", userId, { via: "claim" });
  return { ok: true };
}

export async function pauseSession(
  db: SupabaseClient,
  sessionId: string,
  userId: string,
  reason?: string
): Promise<{ ok: true } | { error: string }> {
  const { data: s, error: rErr } = await db
    .from("chat_sessions")
    .select("id, status, assignee_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (rErr) return { error: rErr.message };
  if (!s) return { error: "Sessão não encontrada." };
  if (s.status !== "active") return { error: "Só sessões em atendimento podem pausar." };

  const { error } = await db
    .from("chat_sessions")
    .update({ status: "paused" })
    .eq("id", sessionId)
    .eq("status", "active");
  if (error) return { error: error.message };

  await db.from("chat_session_pauses").insert({
    session_id: sessionId,
    reason: reason ?? null,
  });
  await appendEvent(db, sessionId, "paused", userId, { reason: reason ?? null });
  return { ok: true };
}

export async function resumeSession(
  db: SupabaseClient,
  sessionId: string,
  userId: string
): Promise<{ ok: true } | { error: string }> {
  const { data: s } = await db
    .from("chat_sessions")
    .select("id, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (!s || s.status !== "paused") {
    return { error: "Sessão não está pausada." };
  }

  const now = new Date().toISOString();
  const { data: openPause } = await db
    .from("chat_session_pauses")
    .select("id, started_at")
    .eq("session_id", sessionId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openPause) {
    await db
      .from("chat_session_pauses")
      .update({ ended_at: now })
      .eq("id", openPause.id);
  }

  const { error } = await db
    .from("chat_sessions")
    .update({ status: "active" })
    .eq("id", sessionId)
    .eq("status", "paused");
  if (error) return { error: error.message };

  await appendEvent(db, sessionId, "resumed", userId, {});
  return { ok: true };
}

export async function closeSession(
  db: SupabaseClient,
  sessionId: string,
  userId: string,
  reason?: string
): Promise<{ ok: true } | { error: string }> {
  const { data: s, error: rErr } = await db
    .from("chat_sessions")
    .select(
      "id, status, created_at, assigned_at, paused_seconds, queue_id, assignee_id"
    )
    .eq("id", sessionId)
    .maybeSingle();

  if (rErr) return { error: rErr.message };
  if (!s) return { error: "Sessão não encontrada." };
  if (s.status === "closed") return { error: "Sessão já encerrada." };

  const now = new Date().toISOString();

  // fecha pausa aberta, se houver
  const { data: openPause } = await db
    .from("chat_session_pauses")
    .select("id")
    .eq("session_id", sessionId)
    .is("ended_at", null)
    .maybeSingle();
  if (openPause) {
    await db
      .from("chat_session_pauses")
      .update({ ended_at: now })
      .eq("id", openPause.id);
  }

  let hours: BusinessHours | null = null;
  let csatDue: string | null = null;
  if (s.queue_id) {
    const { data: q } = await db
      .from("chat_queues")
      .select("business_hours, csat_enabled, csat_delay_seconds")
      .eq("id", s.queue_id)
      .maybeSingle();
    hours = (q?.business_hours as BusinessHours) ?? null;

    if (q?.csat_enabled) {
      csatDue = new Date(
        Date.now() + ((q.csat_delay_seconds as number) || 60) * 1000
      ).toISOString();
    }
  }

  const { data: pauses } = await db
    .from("chat_session_pauses")
    .select("started_at, ended_at")
    .eq("session_id", sessionId);

  let pausedSec = 0;
  for (const p of pauses ?? []) {
    pausedSec += businessSeconds(
      p.started_at as string,
      (p.ended_at as string) || now,
      hours
    );
  }

  const waitSec = s.assigned_at
    ? businessSeconds(s.created_at as string, s.assigned_at as string, hours)
    : businessSeconds(s.created_at as string, now, hours);

  const handleRaw = s.assigned_at
    ? businessSeconds(s.assigned_at as string, now, hours)
    : 0;
  const handleSec = Math.max(0, handleRaw - pausedSec);

  const { error } = await db
    .from("chat_sessions")
    .update({
      status: "closed",
      closed_at: now,
      closed_by: userId,
      close_reason: reason ?? null,
      wait_seconds: waitSec,
      handle_seconds: handleSec,
      paused_seconds: pausedSec,
      csat_due_at: csatDue,
    })
    .eq("id", sessionId)
    .neq("status", "closed");

  if (error) return { error: error.message };

  await appendEvent(db, sessionId, "closed", userId, {
    reason: reason ?? null,
    wait_seconds: waitSec,
    handle_seconds: handleSec,
  });

  return { ok: true };
}

export async function getOpenSessionForLead(
  db: SupabaseClient,
  leadId: string
): Promise<(ChatSession & { assignee_name?: string | null }) | null> {
  const { data } = await db
    .from("chat_sessions")
    .select(
      "id, lead_id, queue_id, number_id, status, assignee_id, opened_by, created_at, assigned_at, first_agent_reply_at, closed_at, closed_by, close_reason, wait_seconds, handle_seconds, paused_seconds, routing_reason, csat_due_at"
    )
    .eq("lead_id", leadId)
    .in("status", ["waiting", "active", "paused"])
    .maybeSingle();

  if (!data) return null;
  const row = data as ChatSession;
  let assignee_name: string | null = null;
  if (row.assignee_id) {
    const { data: pr } = await db
      .from("profiles")
      .select("name")
      .eq("id", row.assignee_id)
      .maybeSingle();
    assignee_name = (pr as { name?: string } | null)?.name ?? null;
  }

  return { ...row, assignee_name };
}
