"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { typingPresence } from "@/app/(dashboard)/crm/whatsapp-actions";

/**
 * "digitando…" nos dois sentidos:
 * - do CONTATO: chat_presence via realtime (some após 8s), com polling leve
 *   de 4s como rede de segurança — o banco é a fonte da verdade.
 * - NOSSO pro contato: debounced (composing ao digitar, paused após 4s parado).
 */
export function useTypingPresence(leadId: string, hasPhone: boolean) {
  const supabase = useMemo(() => createClient(), []);
  const [contactTyping, setContactTyping] = useState(false);
  const typingHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const presenceChannel = supabase
      .channel(`wa-chat-presence-${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_presence",
          filter: `lead_id=eq.${leadId}`,
        },
        (payload) => {
          const st = (payload.new as { state?: string } | null)?.state;
          if (st === "composing") {
            setContactTyping(true);
            if (typingHideTimer.current) clearTimeout(typingHideTimer.current);
            typingHideTimer.current = setTimeout(
              () => setContactTyping(false),
              8000
            );
          } else {
            setContactTyping(false);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [supabase, leadId]);

  useEffect(() => {
    setContactTyping(false);
    return () => {
      if (typingHideTimer.current) clearTimeout(typingHideTimer.current);
    };
  }, [leadId]);

  // Fallback do "digitando…": polling leve (1 linha a cada 4s) — garante o
  // indicador mesmo se o realtime piscar.
  useEffect(() => {
    const iv = setInterval(async () => {
      const { data } = await supabase
        .from("chat_presence")
        .select("state, at")
        .eq("lead_id", leadId)
        .maybeSingle();
      const row = data as { state?: string; at?: string } | null;
      const fresh = !!row?.at && Date.now() - new Date(row.at).getTime() < 8000;
      if (row?.state === "composing" && fresh) setContactTyping(true);
    }, 4000);
    return () => clearInterval(iv);
  }, [supabase, leadId]);

  const typingRef = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pingTyping() {
    if (!hasPhone) return;
    if (!typingRef.current) {
      typingRef.current = true;
      void typingPresence(leadId, "composing");
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      typingRef.current = false;
      void typingPresence(leadId, "paused");
    }, 4000);
  }

  function stopTyping() {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (typingRef.current) {
      typingRef.current = false;
      void typingPresence(leadId, "paused");
    }
  }

  useEffect(() => () => stopTyping(), [leadId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { contactTyping, pingTyping, stopTyping };
}
