import { useEffect, useMemo, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Board ao vivo: lead novo do WhatsApp e cards movidos por automação
 *  aparecem sem F5 (realtime + refresh ao focar a aba + tick de 60s). */
export function useKanbanLive(activeIdRef: RefObject<string | null>) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (activeIdRef.current) return; // nunca durante um arrasto
      if (t) clearTimeout(t);
      t = setTimeout(() => router.refresh(), 800);
    };
    const channel = supabase
      .channel(`kanban-live`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        refresh
      )
      .subscribe();
    const onFocus = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    const iv = setInterval(refresh, 60_000);
    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      clearInterval(iv);
      if (t) clearTimeout(t);
    };
  }, [supabase, router, activeIdRef]);
}
