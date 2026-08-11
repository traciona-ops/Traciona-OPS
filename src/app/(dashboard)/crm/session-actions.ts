"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  claimSession,
  pauseSession,
  resumeSession,
  closeSession,
  getOpenSessionForLead,
} from "@/lib/chat-sessions/lifecycle";
import type { InboxSessionRow, QueueTab } from "@/lib/chat-sessions/types";

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
