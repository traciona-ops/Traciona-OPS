"use client";

import { Search } from "lucide-react";
import { ListFilters } from "@/components/chat/workspace/conversation-list/list-filters";
import { ConversationRow } from "@/components/chat/workspace/conversation-list/conversation-row";
import type { ChatNumber, Conv, ConvFilters } from "@/components/chat/types";

// busca ignora acentos (digitar "claudineia" acha "Claudinéia")
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "");

/** Aplica busca + filtros de número, setor e responsável. */
export function filterConvs(
  convs: Conv[],
  f: ConvFilters,
  currentUserId: string
): Conv[] {
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
    // telefone digitado com formatação — compara só os dígitos
    const digits = q.replace(/\D/g, "");
    return (
      digits.length >= 4 && (c.phone ?? "").replace(/\D/g, "").includes(digits)
    );
  });
}

export function ConversationList({
  hidden,
  collapsed,
  header,
  newPanel,
  filters,
  onFilters,
  chatNumbers,
  team,
  convs,
  typingMap,
  selectedId,
  onOpen,
  currentUserId,
}: {
  /** A central de Configurações abriu: a lista sai de cena. */
  hidden: boolean;
  /** Mobile com conversa aberta: some pra dar a tela toda ao thread. */
  collapsed: boolean;
  header: React.ReactNode;
  newPanel: React.ReactNode;
  filters: ConvFilters;
  onFilters: (patch: Partial<ConvFilters>) => void;
  chatNumbers: ChatNumber[];
  team: { id: string; name: string }[];
  convs: Conv[];
  typingMap: Record<string, boolean>;
  selectedId: string | null;
  onOpen: (c: Conv) => void;
  currentUserId: string;
}) {
  const visible = filterConvs(convs, filters, currentUserId);
  const filtering =
    filters.sector !== "todos" ||
    filters.owner !== "todos" ||
    filters.number !== "todos" ||
    !!filters.search;

  return (
    <aside
      className={
        hidden
          ? "hidden"
          : `w-full flex-col border-r border-[var(--color-border)] sm:flex sm:w-80 ${
              collapsed ? "hidden" : "flex"
            }`
      }
    >
      {header}
      {newPanel}
      <ListFilters
        filters={filters}
        onChange={onFilters}
        chatNumbers={chatNumbers}
        team={team}
      />
      <div className="flex-1 divide-y divide-[var(--color-border)]/60 overflow-y-auto">
        {visible.map((c) => (
          <ConversationRow
            key={c.lead_id}
            conv={c}
            active={selectedId === c.lead_id}
            typing={!!typingMap[c.lead_id]}
            onOpen={() => onOpen(c)}
          />
        ))}
        {visible.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-surface-2)]">
              <Search className="h-5 w-5 text-[var(--color-muted-2)]" />
            </div>
            <p className="text-xs text-[var(--color-muted)]">
              Nenhuma conversa com esses filtros.
            </p>
            {filtering && (
              <button
                onClick={() =>
                  onFilters({
                    sector: "todos",
                    owner: "todos",
                    number: "todos",
                    search: "",
                  })
                }
                className="text-xs font-medium text-[var(--color-primary)] hover:underline"
              >
                Limpar filtros
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
