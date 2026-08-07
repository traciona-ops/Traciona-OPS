"use client";

import { CalendarDays, Search } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { SOURCE_LABEL, type LeadSource, type Profile } from "@/lib/types";

export type LeadFilter = {
  q: string;
  ownerId: string;
  source: string;
  late: boolean;
  withTask: boolean;
  createdFrom: string; // yyyy-mm-dd
  createdTo: string;
};

export const EMPTY_FILTER: LeadFilter = {
  q: "",
  ownerId: "",
  source: "",
  late: false,
  withTask: false,
  createdFrom: "",
  createdTo: "",
};

export function activeFilterCount(f: LeadFilter): number {
  let n = 0;
  if (f.q.trim()) n++;
  if (f.ownerId) n++;
  if (f.source) n++;
  if (f.late) n++;
  if (f.withTask) n++;
  if (f.createdFrom || f.createdTo) n++;
  return n;
}

// Diálogo de filtro (Dialog padrão do sistema): seções separadas,
// "Limpar tudo" no topo e o resumo de ativos no rodapé.
// Os filtros aplicam ao vivo — o botão "Filtrar" só fecha o diálogo.
export function FilterBar({
  team,
  value,
  onChange,
  onClose,
}: {
  team: Profile[];
  value: LeadFilter;
  onChange: (f: LeadFilter) => void;
  onClose: () => void;
}) {
  const set = <K extends keyof LeadFilter>(k: K, v: LeadFilter[K]) =>
    onChange({ ...value, [k]: v });

  const count = activeFilterCount(value);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Filtro"
      size="sm"
      footer={
        <>
          <span className="mr-auto text-xs text-[var(--color-muted)]">
            Filtros ativos: <span className="font-semibold">{count}</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[var(--color-primary)] px-6 py-2.5 text-sm font-semibold text-[var(--color-primary-foreground)] transition hover:bg-[var(--color-primary-hover)]"
          >
            Filtrar
          </button>
        </>
      }
    >
      <div className="-mt-1 mb-1 flex justify-end">
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTER)}
          disabled={count === 0}
          className="text-xs font-medium text-[var(--color-muted)] transition hover:text-[var(--color-foreground)] disabled:opacity-40"
        >
          Limpar tudo
        </button>
      </div>

      <div className="-mx-5">
        <Section label="Pesquisar na etapa">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-2)]" />
              <input
                value={value.q}
                onChange={(e) => set("q", e.target.value)}
                placeholder="Nome, #código ou celular"
                autoFocus
                className="h-11 w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] pl-9 pr-3 text-sm placeholder:text-[var(--color-muted-2)] focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
          </Section>

          <Section label="Responsável">
            <select
              value={value.ownerId}
              onChange={(e) => set("ownerId", e.target.value)}
              className="h-11 w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm"
            >
              <option value="">Todos responsáveis</option>
              <option value="none">Sem responsável</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Section>

          <Section label="Origem">
            <select
              value={value.source}
              onChange={(e) => set("source", e.target.value)}
              className="h-11 w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm"
            >
              <option value="">Todas as origens</option>
              {Object.entries(SOURCE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Section>

          <Section label="Situação">
            <ToggleRow
              label="Atrasados (estouraram o SLA)"
              checked={value.late}
              onToggle={() => set("late", !value.late)}
            />
            <ToggleRow
              label="Com tarefa aberta"
              checked={value.withTask}
              onToggle={() => set("withTask", !value.withTask)}
            />
          </Section>

          <Section label="Filtrar por data de criação">
            <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border-strong)] px-3 py-2.5">
              <CalendarDays className="h-4 w-4 shrink-0 text-[var(--color-muted-2)]" />
              <input
                type="date"
                value={value.createdFrom}
                max={value.createdTo || undefined}
                onChange={(e) => set("createdFrom", e.target.value)}
                aria-label="Criado a partir de"
                className="min-w-0 flex-1 bg-transparent text-sm text-[var(--color-foreground)] focus:outline-none"
              />
              <span className="text-[var(--color-muted-2)]">–</span>
              <input
                type="date"
                value={value.createdTo}
                min={value.createdFrom || undefined}
                onChange={(e) => set("createdTo", e.target.value)}
                aria-label="Criado até"
                className="min-w-0 flex-1 bg-transparent text-sm text-[var(--color-foreground)] focus:outline-none"
              />
            </div>
          </Section>
      </div>
    </Dialog>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5 border-b border-[var(--color-border)] px-4 py-4">
      <p className="text-[13px] font-semibold">{label}</p>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      role="switch"
      aria-checked={checked}
      className="flex w-full items-center justify-between rounded-xl border border-[var(--color-border-strong)] px-3 py-2.5 text-left text-sm transition hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
    >
      {label}
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked
            ? "bg-[var(--color-primary)]"
            : "bg-[var(--color-border-strong)]"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-[var(--color-surface)] transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export type { LeadSource };
