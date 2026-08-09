"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Sinal global de "tem cliente esperando": badge no título da aba + notificação
// do navegador com o NOME do lead (clicável → abre a conversa). Antes disso,
// mensagem nova só avisava com a tela de Mensagens aberta.

const BASE_TITLE = "Traciona";

export function NotificationsProvider() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const countTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    async function refreshCount() {
      const { count } = await supabase
        .from("whatsapp_messages")
        .select("id", { count: "exact", head: true })
        .eq("direction", "in")
        .is("read_at", null);
      const n = count ?? 0;
      document.title = n > 0 ? `(${n}) ${BASE_TITLE}` : BASE_TITLE;
    }
    const scheduleCount = () => {
      if (countTimer.current) clearTimeout(countTimer.current);
      countTimer.current = setTimeout(refreshCount, 600);
    };
    refreshCount();

    const channel = supabase
      .channel("wa-global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages" },
        async (payload) => {
          scheduleCount();
          const m = payload.new as {
            lead_id: string;
            direction: string;
            body: string | null;
            media_type: string | null;
          };
          if (m.direction !== "in") return;
          // na tela cheia do OPS Chat o próprio chat já notifica
          if (pathRef.current?.startsWith("/chat")) return;

          const { data: lead } = await supabase
            .from("leads")
            .select("name")
            .eq("id", m.lead_id)
            .maybeSingle();
          const name = (lead as { name?: string } | null)?.name ?? "Lead";
          try {
            if (
              typeof Notification !== "undefined" &&
              Notification.permission === "granted"
            ) {
              const n = new Notification(name, {
                body:
                  m.body?.replace(/\*([^*\n]+)\*/g, "$1").replace(/_([^_\n]+)_/g, "$1") ??
                  (m.media_type ? "Enviou um anexo" : ""),
                tag: `wa-${m.lead_id}`,
              });
              n.onclick = () => {
                window.focus();
                router.push(`/crm/mensagens?lead=${m.lead_id}`);
              };
            }
          } catch {
            // ignore
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "whatsapp_messages" },
        () => scheduleCount() // read_at marcado → badge do título cai
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      document.title = BASE_TITLE;
    };
  }, [supabase, router]);

  return null;
}
