import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ACD: atribui sessão waiting ao operador online com menos chats ativos
 * (e abaixo do max_concurrent). Best-effort — não falha a ingestão.
 */
export async function tryAcAssign(
  admin: SupabaseClient,
  sessionId: string,
  queueId: string | null
): Promise<{ assigned: boolean; userId?: string }> {
  const { data: agents } = await admin
    .from("agent_presence")
    .select("user_id, max_concurrent")
    .eq("status", "online");

  if (!agents?.length) return { assigned: false };

  const ids = agents.map((a) => a.user_id as string);

  // carga por operador
  const { data: active } = await admin
    .from("chat_sessions")
    .select("assignee_id")
    .eq("status", "active")
    .in("assignee_id", ids);

  const load = new Map<string, number>();
  for (const id of ids) load.set(id, 0);
  for (const row of active ?? []) {
    const a = row.assignee_id as string | null;
    if (a) load.set(a, (load.get(a) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestLoad = Infinity;
  for (const a of agents) {
    const uid = a.user_id as string;
    const max = (a.max_concurrent as number) || 5;
    const cur = load.get(uid) ?? 0;
    if (cur >= max) continue;
    if (cur < bestLoad) {
      bestLoad = cur;
      best = uid;
    }
  }

  if (!best) return { assigned: false };

  const now = new Date().toISOString();
  const { data: updated, error } = await admin
    .from("chat_sessions")
    .update({
      status: "active",
      assignee_id: best,
      assigned_at: now,
      routing_reason: queueId ? "acd" : "acd",
    })
    .eq("id", sessionId)
    .eq("status", "waiting")
    .is("assignee_id", null)
    .select("id")
    .maybeSingle();

  if (error || !updated) return { assigned: false };

  await admin.from("chat_session_events").insert({
    session_id: sessionId,
    kind: "assigned",
    actor_id: null,
    payload: { user_id: best, via: "acd" },
  });

  return { assigned: true, userId: best };
}
