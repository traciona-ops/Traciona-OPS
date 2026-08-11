"use client";

import { QueuePillsList } from "@/components/chat/workspace/conversation-list/queue-pills-list";
import type { Conv, ConvFilters } from "@/components/chat/types";

/** Coluna esquerda do inbox: NumberHeader (fora) + pills + lista. */
export function ConversationList({
  hidden,
  collapsed,
  header,
  newPanel,
  filters,
  onFilters,
  convs,
  typingMap,
  selectedId,
  onOpen,
  currentUserId,
  sessionsEnabled = false,
  countsTick,
}: {
  hidden: boolean;
  collapsed: boolean;
  header: React.ReactNode;
  newPanel: React.ReactNode;
  filters: ConvFilters;
  onFilters: (patch: Partial<ConvFilters>) => void;
  convs: Conv[];
  typingMap: Record<string, boolean>;
  selectedId: string | null;
  onOpen: (c: Conv, sessionId?: string) => void;
  currentUserId: string;
  sessionsEnabled?: boolean;
  countsTick?: number;
}) {
  return (
    <aside
      className={
        hidden
          ? "hidden"
          : `w-full flex-col border-r border-[var(--color-border)] sm:flex sm:w-[22rem] ${
              collapsed ? "hidden" : "flex"
            }`
      }
    >
      {header}
      {newPanel}
      <QueuePillsList
        sessionsEnabled={sessionsEnabled}
        selectedLeadId={selectedId}
        currentUserId={currentUserId}
        onOpen={onOpen}
        countsTick={countsTick}
        search={filters.search}
        onSearch={(v) => onFilters({ search: v })}
        crmConvs={convs}
        typingMap={typingMap}
      />
    </aside>
  );
}

/** Mantido para callers legados / testes. */
export function filterConvs(
  convs: Conv[],
  f: ConvFilters,
  currentUserId: string
): Conv[] {
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return convs.filter((c) => {
    if (f.number !== "todos" && (c.number_id ?? "principal") !== f.number)
      return false;
    if (f.sector !== "todos" && c.sector !== f.sector) return false;
    if (f.owner === "meus" && c.owner_id !== currentUserId) return false;
    if (f.owner === "none" && c.owner_id) return false;
    if (!["todos", "meus", "none"].includes(f.owner) && c.owner_id !== f.owner)
      return false;
    const q = f.search.trim();
    if (!q) return true;
    if (norm(`${c.name} ${c.phone ?? ""}`).includes(norm(q))) return true;
    const digits = q.replace(/\D/g, "");
    return (
      digits.length >= 4 && (c.phone ?? "").replace(/\D/g, "").includes(digits)
    );
  });
}
