import { Search } from "lucide-react";
import { cn, currencyBRL } from "@/lib/utils/ui";
import type { Filter, FilterCounts, SalesKpis } from "./types";

export function SalesFilters({
  filter,
  setFilter,
  counts,
  kpis,
  q,
  setQ,
}: {
  filter: Filter;
  setFilter: (f: Filter) => void;
  counts: FilterCounts;
  kpis: SalesKpis;
  q: string;
  setQ: (q: string) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {(
        [
          { key: "todos", label: "Todos" },
          { key: "ativa", label: "Assinatura ativa" },
          {
            key: "atraso",
            label:
              kpis.atrasado > 0
                ? `Em atraso · ${currencyBRL(kpis.atrasado)}`
                : "Em atraso",
          },
          { key: "historico", label: "Histórico" },
        ] as { key: Filter; label: string }[]
      ).map((t) => (
        <button
          key={t.key}
          onClick={() => setFilter(t.key)}
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors",
            filter === t.key
              ? "border-transparent bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
              : t.key === "atraso" && counts.atraso > 0
              ? "border-[var(--color-danger)]/40 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/8"
              : "border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
          )}
        >
          {t.label}
          <span
            className={cn(
              "rounded-full px-1.5 text-[11px] font-semibold",
              filter === t.key
                ? "bg-[color-mix(in_srgb,var(--color-primary-foreground)_25%,transparent)]"
                : "bg-[var(--color-surface-2)] text-[var(--color-muted-2)]"
            )}
          >
            {counts[t.key]}
          </span>
        </button>
      ))}
      <div className="relative ml-auto min-w-0 basis-52">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-2)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cliente..."
          className="h-9 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 text-sm outline-none transition focus:border-[var(--color-primary)]"
        />
      </div>
    </div>
  );
}
