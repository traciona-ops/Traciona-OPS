"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Rolagem do thread: abre no fim, acompanha mensagem nova quando você já está
 * embaixo, e expõe o botão de "voltar pro fim" quando você subiu.
 */
export function useChatScroll(leadId: string, msgCount: number) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [awayFromBottom, setAwayFromBottom] = useState(false);

  const nearBottom = () => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 240;
  };
  const scrollToBottom = (smooth = false) => {
    const el = scrollRef.current;
    if (el)
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };

  useEffect(() => {
    scrollToBottom(false); // trocar de conversa → direto no fim
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  const lastLenRef = useRef(msgCount);
  useEffect(() => {
    if (msgCount > lastLenRef.current && nearBottom()) {
      scrollToBottom(true);
    }
    lastLenRef.current = msgCount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgCount]);

  const onScroll = () => setAwayFromBottom(!nearBottom());

  return { scrollRef, awayFromBottom, onScroll, nearBottom, scrollToBottom };
}
