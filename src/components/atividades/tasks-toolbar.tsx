"use client";

import { Plus, List, Columns3, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TaskFilter, ViewMode } from "./types";

type TasksToolbarProps = {
  visibleCount: number;
  q: string;
  setQ: (q: string) => void;
  filter: TaskFilter;
  setFilter: (f: TaskFilter) => void;
  view: ViewMode;
  setView: (v: ViewMode) => void;
  onNewTask: () => void;
};

export function TasksToolbar({
  visibleCount,
  q,
  setQ,
  filter,
  setFilter,
  view,
  setView,
  onNewTask,
}: TasksToolbarProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5">
      <h1 className="order-1 text-xl font-bold tracking-tight">
        Tarefas{" "}
        <span className="text-sm font-medium text-[var(--color-muted-2)]">
          ({visibleCount})
        </span>
      </h1>

      <div className="order-3 relative w-full min-w-0 sm:order-2 sm:w-auto sm:min-w-40 sm:flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-2)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pesquisar"
          className="h-10 w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] pl-9 pr-3 text-sm placeholder:text-[var(--color-muted-2)] focus:border-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        />
      </div>

      <div className="order-4 flex max-w-full overflow-x-auto rounded-xl bg-[var(--color-surface-2)] p-0.5 text-xs font-medium sm:order-3">
        {(
          [
            ["todas", "Todas"],
            ["pendentes", "Pendentes"],
            ["atrasadas", "Atrasadas"],
            ["minhas", "Minhas"],
          ] as [TaskFilter, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-lg px-3 py-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
              filter === k
                ? "bg-[var(--color-surface)] font-semibold text-[var(--color-foreground)] shadow-sm"
                : "text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="order-5 flex rounded-xl bg-[var(--color-surface-2)] p-0.5 sm:order-4">
        {(
          [
            ["lista", "Lista", List],
            ["quadro", "Quadro", Columns3],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setView(k)}
            title={label}
            aria-label={label}
            className={`flex min-h-9 min-w-9 items-center justify-center rounded-lg px-2.5 py-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
              view === k
                ? "bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm"
                : "text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>

      <Button onClick={onNewTask} className="order-2 ml-auto sm:order-6 sm:ml-0">
        <Plus className="h-4 w-4" />
        Nova tarefa
      </Button>
    </div>
  );
}
