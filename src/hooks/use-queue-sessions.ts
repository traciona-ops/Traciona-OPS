"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { listQueueSessions } from "@/app/(dashboard)/crm/session-actions";
import type { InboxSessionRow, QueueTab } from "@/lib/chat-sessions/types";

/** Lista de sessões por aba + realtime em chat_sessions. */
export function useQueueSessions(tab: QueueTab, enabled: boolean) {
  const supabase = useMemo(() => createClient(), []);
  const [sessions, setSessions] = useState<InboxSessionRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setSessions([]);
      setLoaded(true);
      return;
    }
    const r = await listQueueSessions(tab);
    setSessions(r.sessions ?? []);
    setLoaded(true);
  }, [tab, enabled]);

  useEffect(() => {
    setLoaded(false);
    void load();
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    const schedule = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => void load(), 400);
    };
    const channel = supabase
      .channel(`queue-sessions-${tab}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_sessions" },
        schedule
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages" },
        schedule
      )
      .subscribe();

    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    const iv = setInterval(() => void load(), 30_000);

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
      clearInterval(iv);
    };
  }, [enabled, tab, supabase, load]);

  return { sessions, loaded, load };
}
