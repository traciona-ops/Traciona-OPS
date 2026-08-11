"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getOpenSession } from "@/app/(dashboard)/crm/session-actions";
import type { ChatSession } from "@/lib/chat-sessions/types";

export type ActiveSession = ChatSession & { assignee_name?: string | null };

/** Sessão aberta do lead + patch via realtime em chat_sessions. */
export function useActiveSession(leadId: string | null, enabled: boolean) {
  const supabase = useMemo(() => createClient(), []);
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!leadId || !enabled) {
      setSession(null);
      return;
    }
    setLoading(true);
    const r = await getOpenSession(leadId);
    setSession(r.session);
    setLoading(false);
  }, [leadId, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!leadId || !enabled) return;
    const channel = supabase
      .channel(`chat-session-${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_sessions",
          filter: `lead_id=eq.${leadId}`,
        },
        () => {
          void reload();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [leadId, enabled, supabase, reload]);

  return { session, loading, reload };
}
