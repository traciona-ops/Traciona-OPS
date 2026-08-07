"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { WifiOff, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Banner vermelho global quando a sessão do WhatsApp cai. O cron grava o
// status em system_state a cada minuto; aqui a gente lê + escuta realtime.
// (A instância caída não consegue se auto-avisar por WhatsApp — por isso o
// alerta é visual + notificação do navegador.)

type WaState = { online?: boolean; since?: string; checked_at?: string };

function minsAgo(iso?: string): string {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "agora há pouco";
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  return `há ${h}h${m % 60 > 0 ? ` ${m % 60}min` : ""}`;
}

export function WhatsappBanner() {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<WaState | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const prevOnline = useRef<boolean | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      const { data } = await supabase
        .from("system_state")
        .select("value")
        .eq("key", "whatsapp")
        .maybeSingle();
      if (!alive || !data) return;
      const v = data.value as WaState;

      // transição online → offline: notificação do navegador (1x por queda)
      if (prevOnline.current === true && v.online === false) {
        setDismissed(false);
        try {
          if (
            typeof Notification !== "undefined" &&
            Notification.permission === "granted"
          ) {
            new Notification("⚠️ WhatsApp desconectou!", {
              body: "As mensagens pararam de chegar. Reconecte em Configurações.",
              tag: "wa-down",
            });
          }
        } catch {
          // ignore
        }
      }
      if (v.online === true) setDismissed(false);
      prevOnline.current = v.online ?? null;
      setState(v);
    }

    load();
    // realtime: reage no tick seguinte à queda/volta
    const channel = supabase
      .channel("wa-state")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "system_state" },
        () => load()
      )
      .subscribe();
    // fallback: revalida a cada 90s mesmo sem realtime
    const iv = setInterval(load, 90_000);
    return () => {
      alive = false;
      clearInterval(iv);
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  if (!state || state.online !== false || dismissed) return null;

  return (
    <div className="flex shrink-0 items-center gap-2.5 bg-[var(--color-danger)] px-4 py-2 text-sm font-medium text-[var(--color-on-accent)]">
      <WifiOff className="h-4 w-4 shrink-0 animate-pulse" />
      <span className="min-w-0 flex-1 truncate">
        WhatsApp desconectado {minsAgo(state.since)} — mensagens NÃO estão
        chegando.
      </span>
      <Link
        href="/chat?prefs=1"
        className="shrink-0 rounded-lg bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30"
      >
        Reconectar
      </Link>
      <button
        onClick={() => setDismissed(true)}
        className="grid h-9 w-9 shrink-0 place-items-center rounded text-[var(--color-on-accent)]/80 hover:text-[var(--color-on-accent)]"
        aria-label="Dispensar aviso"
        title="Esconder (volta se continuar caído no próximo alerta)"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
