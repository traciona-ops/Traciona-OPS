"use client";

import { useRouter } from "next/navigation";
import { Flag } from "lucide-react";
import { updateTask } from "@/app/(dashboard)/crm/actions";
import type { TaskPriority } from "@/lib/types";
import { TASK_PRIORITY } from "@/lib/data/labels";
import { PRIORITY_ORDER } from "./helpers";
import type { ViewTask } from "./types";

/** Bandeirinha de prioridade — clique cicla urgente → alta → normal → baixa. */
export function PriorityFlag({
  task,
  size = "h-3.5 w-3.5",
}: {
  task: ViewTask;
  size?: string;
}) {
  const router = useRouter();
  const p = (task.priority ?? "normal") as TaskPriority;

  async function cycle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next =
      PRIORITY_ORDER[(PRIORITY_ORDER.indexOf(p) + 1) % PRIORITY_ORDER.length];
    await updateTask(task.id, { priority: next });
    router.refresh();
  }

  return (
    <button
      onClick={cycle}
      title={`Prioridade: ${TASK_PRIORITY[p].label} (clique pra mudar)`}
      aria-label={`Prioridade ${TASK_PRIORITY[p].label}`}
      className="flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
    >
      <Flag
        className={size}
        style={{ color: TASK_PRIORITY[p].color }}
        fill={p === "urgente" || p === "alta" ? TASK_PRIORITY[p].color : "none"}
      />
    </button>
  );
}
