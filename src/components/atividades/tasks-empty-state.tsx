"use client";

import { ListChecks } from "lucide-react";

type TasksEmptyStateProps = {
  onNewTask: () => void;
};

export function TasksEmptyState({ onNewTask }: TasksEmptyStateProps) {
  return (
    <div className="card flex flex-col items-center p-12 text-center">
      <ListChecks className="mb-3 h-8 w-8 text-[var(--color-muted-2)]" />
      <p className="text-sm font-medium">Tudo limpo aqui!</p>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Nenhuma tarefa nesse filtro no momento.
      </p>
      <button
        onClick={onNewTask}
        className="mt-4 inline-flex min-h-9 items-center rounded-[var(--radius-control)] px-2 text-sm font-semibold text-[var(--color-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
      >
        + Criar nova tarefa agora
      </button>
    </div>
  );
}
