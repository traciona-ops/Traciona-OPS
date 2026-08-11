"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ListChecks, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ymdBR } from "@/lib/utils/dates";
import {
  TaskTypeBadge,
  TaskTypeSelect,
  DEFAULT_TASK_TYPE,
} from "@/components/crm/task-type";
import { createTask, toggleTask, deleteTask } from "@/app/(dashboard)/crm/actions";
import type { LeadTask, Profile, TaskCategory } from "@/lib/types";

export function TaskSection({
  leadId,
  tasks,
  team,
  currentUserId,
}: {
  leadId: string;
  tasks: (LeadTask & { assignee?: { name: string } })[];
  team: Profile[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TaskCategory>(DEFAULT_TASK_TYPE);
  const [assignee, setAssignee] = useState(currentUserId);
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);

  const today = ymdBR();
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  async function add() {
    if (!title.trim()) return;
    setSaving(true);
    await createTask({
      leadId,
      title: title.trim(),
      category,
      assigneeId: assignee || null,
      dueDate: due || null,
    });
    setTitle("");
    setDue("");
    setSaving(false);
    router.refresh();
  }

  function Row({ t }: { t: LeadTask & { assignee?: { name: string } } }) {
    const overdue = !t.done && t.due_date && t.due_date < today;
    return (
      <div className="flex items-center gap-2.5 rounded-lg bg-[var(--color-surface-2)] px-3 py-2">
        <button
          onClick={async () => {
            await toggleTask(t.id, leadId, !t.done);
            router.refresh();
          }}
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
            t.done
              ? "border-[var(--color-success)] bg-[var(--color-success)] text-[var(--color-on-accent)]"
              : "border-[var(--color-border-strong)]"
          }`}
        >
          {t.done && <Check className="h-3 w-3" />}
        </button>
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-sm ${
              t.done ? "text-[var(--color-muted-2)] line-through" : ""
            }`}
          >
            {t.title}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-muted)]">
            <TaskTypeBadge value={t.category} />
            {t.assignee?.name && <span>{t.assignee.name}</span>}
            {t.due_date && (
              <span className={overdue ? "text-[var(--color-danger)]" : ""}>
                {overdue ? "venceu " : "prazo "}
                {new Date(t.due_date + "T00:00:00").toLocaleDateString("pt-BR")}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={async () => {
            await deleteTask(t.id, leadId);
            router.refresh();
          }}
          className="text-[var(--color-muted-2)] hover:text-[var(--color-danger)]"
          aria-label="Excluir tarefa"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-[var(--color-primary)]" />
        <h3 className="text-sm font-semibold">Tarefas</h3>
        {open.length > 0 && (
          <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 text-xs text-[var(--color-muted)]">
            {open.length} aberta(s)
          </span>
        )}
      </div>

      <div className="mb-4 space-y-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nova tarefa..."
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <div className="flex gap-2">
          <TaskTypeSelect value={category} onChange={setCategory} className="h-10 flex-1" />
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="h-10 flex-1 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 text-xs"
          >
            <option value="">Sem responsável</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === currentUserId ? `${m.name} (eu)` : m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <Input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="h-10 flex-1 text-xs"
          />
          <Button size="sm" onClick={add} disabled={saving || !title.trim()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {tasks.length === 0 && (
          <p className="text-sm text-[var(--color-muted-2)]">Nenhuma tarefa ainda.</p>
        )}
        {open.map((t) => (
          <Row key={t.id} t={t} />
        ))}
        {done.map((t) => (
          <Row key={t.id} t={t} />
        ))}
      </div>
    </div>
  );
}
