"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Contador de não-lidas do botão flutuante. Leve de propósito: só um count,
 * com realtime + as mesmas redes de segurança da lista (foco na aba e tique
 * de 60s), porque o realtime some em aba antiga.
 */
export function useUnreadCount() {
  const supabase = useMemo(() => createClient(), []);
  const [unread, setUnread] = useState(0);
  const countTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function refresh() {
      const { count } = await supabase
        .from("whatsapp_messages")
        .select("id", { count: "exact", head: true })
        .eq("direction", "in")
        .is("read_at", null);
      setUnread(count ?? 0);
    }
    const schedule = () => {
      if (countTimer.current) clearTimeout(countTimer.current);
      countTimer.current = setTimeout(refresh, 700);
    };
    refresh();
    const channel = supabase
      .channel("wa-dock-badge")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_messages" },
        () => schedule()
      )
      .subscribe();
    const onFocus = () => {
      if (document.visibilityState === "visible") schedule();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    const iv = setInterval(schedule, 60_000);
    return () => {
      if (countTimer.current) clearTimeout(countTimer.current);
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      clearInterval(iv);
    };
  }, [supabase]);

  return unread;
}
