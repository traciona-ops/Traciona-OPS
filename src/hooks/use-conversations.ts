"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  markConversationRead,
  presenceKeepalive,
} from "@/app/(dashboard)/crm/whatsapp-actions";
import type { Conv } from "@/components/chat/types";
import type { WhatsappMessage } from "@/lib/types";

/**
 * Lista de conversas viva: carga inicial, realtime (mensagens e leads),
 * "digitando…" por conversa e as redes de segurança (refetch ao focar a aba,
 * tique de 30s, polling de presença) — o realtime morre calado em aba
 * aberta há horas, então nada aqui depende só dele.
 *
 * `getSelectedId` devolve a conversa aberta agora: mensagem que chega nela já
 * entra como lida.
 */
export function useConversations(
  getSelectedId: () => string | null,
  initialConversations?: Conv[]
) {
  const supabase = useMemo(() => createClient(), []);
  const seeded = initialConversations !== undefined;
  const [convs, setConvs] = useState<Conv[]>(initialConversations ?? []);
  const [convsLoaded, setConvsLoaded] = useState(seeded);
  const [typingMap, setTypingMap] = useState<Record<string, boolean>>({});
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedGetter = useRef(getSelectedId);
  selectedGetter.current = getSelectedId;

  const loadConvs = useCallback(async () => {
    const { data } = await supabase.rpc("inbox_conversations");
    if (data) setConvs(data as Conv[]);
    setConvsLoaded(true);
  }, [supabase]);

  // Batimento de presença: enquanto o chat estiver aberto, o número fica
  // "online" no WhatsApp (libera o "digitando..." dos contatos); fechou,
  // o cron devolve pra offline em até ~5 min.
  useEffect(() => {
    void presenceKeepalive();
    const iv = setInterval(() => void presenceKeepalive(), 3 * 60_000);
    return () => clearInterval(iv);
  }, []);

  // Fallback do "digitando…" na lista: polling leve a cada 4s (o realtime dá
  // o instantâneo quando entrega; o polling garante SEMPRE — lição da casa).
  useEffect(() => {
    const iv = setInterval(async () => {
      const { data } = await supabase
        .from("chat_presence")
        .select("lead_id, state, at")
        .gt("at", new Date(Date.now() - 9000).toISOString());
      const rows = (data ?? []) as {
        lead_id: string;
        state: string;
        at: string;
      }[];
      const fresh: Record<string, boolean> = {};
      for (const r of rows) if (r.state === "composing") fresh[r.lead_id] = true;
      setTypingMap((prev) => {
        // só re-renderiza se mudou de verdade
        const keys = new Set([...Object.keys(prev), ...Object.keys(fresh)]);
        for (const k of keys) if (!!prev[k] !== !!fresh[k]) return fresh;
        return prev;
      });
    }, 4000);
    return () => clearInterval(iv);
  }, [supabase]);

  useEffect(() => {
    if (!seeded) loadConvs();
    const schedule = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(loadConvs, 800);
    };
    const channel = supabase
      .channel("wa-dock")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages" },
        (payload) => {
          schedule();
          const m = payload.new as WhatsappMessage;
          // conversa aberta no popup → marca lida na hora
          if (m.lead_id === selectedGetter.current() && m.direction === "in") {
            markConversationRead(m.lead_id);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "whatsapp_messages" },
        () => schedule()
      )
      // setor/responsável/nome mudou (aqui ou em outra tela) → lista atualiza,
      // senão o filtro por setor trabalha com dado velho
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "leads" },
        () => schedule()
      )
      .subscribe();

    // "digitando…" na lista: canal PRÓPRIO (várias assinaturas num canal só
    // podem se perder no supabase-js — presença fica isolada)
    const presenceChannel = supabase
      .channel("wa-presence")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_presence" },
        (payload) => {
          const row = payload.new as { lead_id?: string; state?: string } | null;
          const id = row?.lead_id;
          if (!id) return;
          const composing = row?.state === "composing";
          setTypingMap((prev) => ({ ...prev, [id]: composing }));
          const timers = typingTimers.current;
          const old = timers.get(id);
          if (old) clearTimeout(old);
          if (composing) {
            timers.set(
              id,
              setTimeout(() => {
                setTypingMap((prev) => ({ ...prev, [id]: false }));
              }, 8000)
            );
          }
        }
      )
      .subscribe();

    // Rede de segurança: realtime morre silenciosamente em aba aberta há
    // horas — refetch ao focar a aba + tique de 30s garantem a lista fresca.
    const onFocus = () => {
      if (document.visibilityState === "visible") schedule();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    const iv = setInterval(schedule, 30_000);
    const timers = typingTimers.current;
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
      supabase.removeChannel(presenceChannel);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      clearInterval(iv);
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const unreadTotal = useMemo(
    () => convs.reduce((a, c) => a + Number(c.unread || 0), 0),
    [convs]
  );

  return { convs, convsLoaded, loadConvs, typingMap, unreadTotal };
}
