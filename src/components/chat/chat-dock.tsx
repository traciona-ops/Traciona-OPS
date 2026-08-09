"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useChatAccent } from "@/hooks/use-chat-accent";
import { useUnreadCount } from "@/hooks/use-unread-count";
import { ChatWorkspace } from "@/components/chat/workspace/chat-workspace";

/**
 * Botão flutuante + modal de 90% da tela. O conteúdo é o ChatWorkspace —
 * o mesmo componente da página /chat.
 */
export function ChatDock({
  currentUserId,
  userName,
}: {
  currentUserId: string;
  userName: string;
}) {
  const pathname = usePathname();
  const [accent] = useChatAccent();
  const unread = useUnreadCount();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  // a página cheia da mensageria dispensa o botão flutuante
  if (pathname?.startsWith("/crm/mensagens")) return null;

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ "--chat-accent": accent } as React.CSSProperties}
        className="fixed bottom-[72px] right-4 z-[90] flex h-14 w-14 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg ring-4 ring-[var(--chat-accent)]/20 transition hover:scale-105 hover:shadow-xl active:scale-95 md:bottom-5 md:right-5"
        aria-label="OPS Chat"
        title="OPS Chat"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/symbol.svg" alt="OPS Chat" className="h-8 w-8" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--color-danger)] px-1.5 text-[11px] font-bold text-[var(--color-danger-foreground)] shadow">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="dock-backdrop fixed inset-0 z-[95] flex items-center justify-center bg-black/50 backdrop-blur-[2px] sm:p-4"
          onClick={() => setOpen(false)}
        >
          {/* mobile: tela cheia; desktop: modal 90% */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="dock-pop flex h-dvh w-screen overflow-hidden bg-[var(--color-surface)] shadow-2xl sm:h-[90vh] sm:w-[90vw] sm:rounded-[var(--radius-card)] sm:border sm:border-[var(--color-border-strong)]"
          >
            <ChatWorkspace
              currentUserId={currentUserId}
              userName={userName}
              variant="modal"
              onClose={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
