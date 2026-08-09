"use client";

import { ChevronDown } from "lucide-react";
import { relativeDayBR, ymdBR } from "@/lib/utils/dates";
import { MessageBubble } from "@/components/chat/conversation/message-bubble";
import type { ChatMessage } from "@/components/chat/types";

/**
 * Thread rolável: divisores de dia, divisor de "não lidas", bolhas, balão de
 * "digitando" e o botão de voltar pro fim.
 */
export function MessageList({
  messages,
  leadId,
  leadName,
  firstUnreadId,
  contactTyping,
  scrollRef,
  awayFromBottom,
  onScroll,
  onScrollToBottom,
  onReply,
}: {
  messages: ChatMessage[];
  leadId: string;
  leadName: string;
  firstUnreadId: string | null;
  contactTyping: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  awayFromBottom: boolean;
  onScroll: () => void;
  onScrollToBottom: () => void;
  onReply: (m: ChatMessage) => void;
}) {
  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full space-y-2 overflow-y-auto bg-[var(--color-background)] p-3 sm:p-5"
      >
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-[var(--color-muted-2)]">
            Nenhuma mensagem. Envie a primeira abaixo.
          </p>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || ymdBR(prev.created_at) !== ymdBR(m.created_at);
          return (
            <div key={m.id} className="space-y-2">
              {newDay && (
                <div className="flex justify-center py-1.5">
                  <span className="rounded-full bg-[var(--color-surface-2)] px-3 py-1 text-[11px] font-medium capitalize text-[var(--color-muted)] shadow-sm">
                    {relativeDayBR(m.created_at)}
                  </span>
                </div>
              )}
              {m.id === firstUnreadId && (
                <div className="flex items-center gap-2 py-1">
                  <span className="h-px flex-1 bg-[var(--color-success)]/40" />
                  <span className="text-[11px] font-medium text-[var(--color-success)]">
                    Mensagens não lidas
                  </span>
                  <span className="h-px flex-1 bg-[var(--color-success)]/40" />
                </div>
              )}
              <MessageBubble
                m={m}
                leadId={leadId}
                leadName={leadName}
                onReply={onReply}
              />
            </div>
          );
        })}

        {/* balão "digitando" com os 3 pontinhos, estilo app de mensagem */}
        {contactTyping && (
          <div className="flex justify-start">
            <div className="card flex items-center gap-1.5 rounded-2xl px-4 py-3.5">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}
      </div>
      {awayFromBottom && (
        <button
          onClick={onScrollToBottom}
          className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-muted)] shadow-lg transition hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          aria-label="Ir para o fim"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
