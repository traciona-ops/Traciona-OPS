"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Trash2, Loader2, ExternalLink } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  toggleTask,
  deleteTask,
  updateTask,
} from "@/app/(dashboard)/crm/actions";
import { TaskTypeBadge } from "@/components/crm/task-type";
import type { Profile, TaskStatus } from "@/lib/types";
import { TASK_STATUS } from "@/lib/data/labels";
import { PriorityFlag } from "./priority-flag";
import type { ViewTask } from "./types";

const cellSelect =
  "h-8 rounded-lg border border-transparent bg-transparent px-1.5 text-xs hover:border-[var(--color-border-strong)] focus:border-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]";

type TaskTableRowProps = {
  task: ViewTask;
  team: Profile[];
  today: string;
};

export function TaskTableRow({ task, team, today }: TaskTableRowProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const overdue = !task.done && task.due_date && task.due_date < today;
  const status = (task.status ?? "a_fazer") as TaskStatus;
  const statusMeta = TASK_STATUS[status];

  async function patch(p: Parameters<typeof updateTask>[1]) {
    setBusy(true);
    await updateTask(task.id, p);
    setBusy(false);
    router.refresh();
  }

  async function toggle() {
    setBusy(true);
    await toggleTask(task.id, task.lead_id, !task.done);
    setBusy(false);
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    await deleteTask(task.id, task.lead_id);
    setBusy(false);
    router.refresh();
  }

  return (
    <tr className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]/50">
      <td className="px-4 py-2">
        <select
          value={status}
          onChange={(e) => patch({ status: e.target.value as TaskStatus })}
          className="h-7 cursor-pointer rounded-full border-0 px-2.5 text-[11px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          style={{
            backgroundColor: `color-mix(in srgb, ${statusMeta.color} 14%, transparent)`,
            color: statusMeta.color,
          }}
        >
          {(Object.keys(TASK_STATUS) as TaskStatus[]).map((s) => (
            <option key={s} value={s}>
              {TASK_STATUS[s].label}
            </option>
          ))}
        </select>
      </td>

      <td className="max-w-64 px-3 py-2">
        <div className="flex items-center gap-2.5">
          <button
            onClick={toggle}
            disabled={busy}
            aria-label={task.done ? "Reabrir tarefa" : "Concluir tarefa"}
            className="flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          >
            <span
              className={`flex h-4.5 w-4.5 items-center justify-center rounded-full border ${
                task.done
                  ? "border-[var(--color-success)] bg-[var(--color-success)] text-[var(--color-on-accent)]"
                  : "border-[var(--color-border-strong)] hover:border-[var(--color-success)]"
              }`}
            >
              {task.done && <Check className="h-3 w-3" />}
            </span>
          </button>
          <div className="min-w-0">
            <p
              className={`truncate text-sm ${
                task.done
                  ? "text-[var(--color-muted-2)] line-through"
                  : "font-medium"
              }`}
            >
              {task.title}
            </p>
            {task.lead && (
              <Link
                href={`/crm/leads/${task.lead.id}`}
                className="inline-flex max-w-full items-center gap-0.5 truncate text-[11px] text-[var(--color-muted)] hover:text-[var(--color-primary)]"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span className="truncate">{task.lead.name}</span>
              </Link>
            )}
          </div>
        </div>
      </td>

      <td className="px-3 py-2">
        <PriorityFlag task={task} size="h-4 w-4" />
      </td>

      <td className="px-3 py-2">
        <TaskTypeBadge value={task.category} />
      </td>

      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          {task.assignee?.name && (
            <Avatar
              name={task.assignee.name}
              src={task.assignee.avatar_url}
              size={22}
            />
          )}
          <select
            value={task.assignee_id ?? ""}
            onChange={(e) => patch({ assignee_id: e.target.value || null })}
            className={`${cellSelect} max-w-32`}
          >
            <option value="">Ninguém</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </td>

      <td className="px-3 py-2">
        <input
          type="date"
          value={task.due_date ?? ""}
          onChange={(e) => patch({ due_date: e.target.value || null })}
          className={`${cellSelect} tabular-nums ${
            overdue ? "font-semibold text-[var(--color-danger)]" : ""
          }`}
        />
      </td>

      <td className="px-3 py-2 text-xs tabular-nums text-[var(--color-muted)]">
        {task.completed_at
          ? new Date(task.completed_at).toLocaleDateString("pt-BR")
          : "–"}
      </td>

      <td className="px-3 py-2 text-right">
        <button
          onClick={remove}
          disabled={busy}
          className="flex min-h-9 min-w-9 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-muted-2)] transition hover:text-[var(--color-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          aria-label="Excluir tarefa"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </button>
      </td>
    </tr>
  );
}
