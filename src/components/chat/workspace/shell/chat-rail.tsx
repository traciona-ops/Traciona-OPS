"use client";

import {
  LayoutGrid,
  MessageCircle,
  Settings2,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { ChatView } from "@/components/chat/workspace/shell/types";

const ITEMS: {
  id: ChatView;
  label: string;
  icon: typeof MessageCircle;
  managerOnly?: boolean;
}[] = [
  { id: "inbox", label: "Conversas", icon: MessageCircle },
  { id: "my-dash", label: "Minha dashboard", icon: UserRound },
  { id: "ops-dash", label: "Dashboard de atendimentos", icon: LayoutGrid, managerOnly: true },
  { id: "queues", label: "Filas de atendimento", icon: UsersRound, managerOnly: true },
  { id: "settings", label: "Configurações", icon: Settings2 },
];

/** Rail estreito do OPS Chat — troca as views do workspace. */
export function ChatRail({
  view,
  onView,
  unreadTotal,
  isManager,
}: {
  view: ChatView;
  onView: (v: ChatView) => void;
  unreadTotal: number;
  isManager: boolean;
}) {
  return (
    <nav
      aria-label="Navegação do chat"
      className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-[var(--color-border)] bg-[var(--color-surface)] py-3"
    >
      {ITEMS.filter((i) => !i.managerOnly || isManager).map((item) => {
        const Icon = item.icon;
        const active = view === item.id;
        return (
          <button
            key={item.id}
            type="button"
            title={item.label}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            onClick={() => onView(item.id)}
            className={`relative flex h-10 w-10 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
              active
                ? "bg-[var(--color-foreground)] text-[var(--color-background)]"
                : "text-[var(--color-muted-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
            }`}
          >
            <Icon className="h-[18px] w-[18px]" />
            {item.id === "inbox" && unreadTotal > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[9px] font-bold text-white">
                {unreadTotal > 99 ? "99+" : unreadTotal}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
