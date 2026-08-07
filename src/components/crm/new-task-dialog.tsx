"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { createTask } from "@/app/(dashboard)/crm/actions";
import { TaskTypeSelect, DEFAULT_TASK_TYPE } from "@/components/crm/task-type";
import type { Profile, TaskCategory } from "@/lib/types";

export function NewTaskDialog({
  leadId,
  leadName,
  team,
  defaultAssignee,
  onClose,
}: {
  leadId: string;
  leadName?: string;
  team: Profile[];
  defaultAssignee: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TaskCategory>(DEFAULT_TASK_TYPE);
  const [assignee, setAssignee] = useState(defaultAssignee);
  const [due, setDue] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    await createTask({
      leadId,
      title: title.trim(),
      category,
      assigneeId: assignee || null,
      dueDate: due || null,
    });
    setLoading(false);
    router.refresh();
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Nova tarefa"
      description={leadName}
      size="sm"
      dismissible={!loading}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="new-task-form" disabled={loading || !title.trim()}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar tarefa
          </Button>
        </>
      }
    >
      <form id="new-task-form" onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="task-title" className="mb-1 block text-xs text-[var(--color-muted)]">
            O que precisa ser feito?
          </label>
          <Input
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Ligar para confirmar reunião"
            autoFocus
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--color-muted)]">
            Tipo
          </label>
          <TaskTypeSelect value={category} onChange={setCategory} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="task-assignee" className="mb-1 block text-xs text-[var(--color-muted)]">
              Responsável
            </label>
            <select
              id="task-assignee"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="h-10 w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            >
              <option value="">Ninguém</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === defaultAssignee ? `${m.name} (eu)` : m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="task-due" className="mb-1 block text-xs text-[var(--color-muted)]">
              Prazo
            </label>
            <Input
              id="task-due"
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </div>
        </div>
      </form>
    </Dialog>
  );
}
