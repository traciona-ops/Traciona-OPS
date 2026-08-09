"use client";

import { Search } from "lucide-react";
import { type Sector } from "@/lib/types";
import { SECTOR } from "@/lib/data/labels";
import type { ChatNumber, ConvFilters } from "@/components/chat/types";

const SELECT =
  "h-8 min-w-0 flex-1 cursor-pointer rounded-[var(--radius-field)] border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 text-[11px] text-[var(--color-muted)] transition focus:border-[var(--color-primary)] focus:outline-none";

/** Busca + filtros de número, setor e responsável. */
export function ListFilters({
  filters,
  onChange,
  chatNumbers,
  team,
}: {
  filters: ConvFilters;
  onChange: (patch: Partial<ConvFilters>) => void;
  chatNumbers: ChatNumber[];
  team: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-2 border-b border-[var(--color-border)] px-4 py-3">
      <div className="flex h-9 items-center gap-2 rounded-[var(--radius-field)] bg-[var(--color-surface-2)] px-3 ring-1 ring-transparent transition focus-within:ring-[var(--color-primary)]/40">
        <Search className="h-3.5 w-3.5 text-[var(--color-muted-2)]" />
        <input
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
          placeholder="Buscar conversa"
          className="w-full bg-transparent text-xs outline-none placeholder:text-[var(--color-muted-2)]"
        />
      </div>

      {/* número (só com mais de um conectável) */}
      {chatNumbers.length > 1 && (
        <select
          value={filters.number}
          onChange={(e) => onChange({ number: e.target.value })}
          className={`${SELECT} w-full`}
        >
          <option value="todos">Todos os números</option>
          {chatNumbers.map((n) => (
            <option key={n.id} value={n.env_default ? "principal" : n.id}>
              {n.name}
            </option>
          ))}
        </select>
      )}

      {/* setor + responsável, lado a lado, no mesmo formato */}
      <div className="flex gap-2">
        <select
          value={filters.sector}
          onChange={(e) => onChange({ sector: e.target.value as Sector | "todos" })}
          className={SELECT}
        >
          <option value="todos">Todos os setores</option>
          {(Object.keys(SECTOR) as Sector[]).map((s) => (
            <option key={s} value={s}>
              {SECTOR[s].label}
            </option>
          ))}
        </select>
        <select
          value={filters.owner}
          onChange={(e) => onChange({ owner: e.target.value })}
          className={SELECT}
        >
          <option value="todos">Todos os responsáveis</option>
          <option value="meus">Minhas conversas</option>
          <option value="none">Sem responsável</option>
          {team.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
