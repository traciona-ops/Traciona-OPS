"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { createTask } from "@/app/(dashboard)/crm/actions";
import {
  TaskTypeSelect,
  DEFAULT_TASK_TYPE,
} from "@/components/crm/task-type";
import type { Profile, TaskCategory, TaskPriority } from "@/lib/types";
import { TASK_PRIORITY } from "@/lib/data/labels";

type NewTaskDialogProps = {
  team: Profile[];
  leads: { id: string; name: string }[];
  currentUserId: string;
  onClose: () => void;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-[var(--color-muted)]">
        {label}
      </label>
      {children}
    </div>
  );
}

export function NewTaskDialog({
  team,
  leads,
  currentUserId,
  onClose,
}: NewTaskDialogProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TaskCategory>(DEFAULT_TASK_TYPE);
  const [assignee, setAssignee] = useState(currentUserId);
  const [leadId, setLeadId] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    await createTask({
      title: title.trim(),
      category,
      assigneeId: assignee || null,
      leadId: leadId || null,
      dueDate: due || null,
      priority,
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
      size="md"
      dismissible={!loading}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="new-task-form"
            disabled={loading || !title.trim()}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar tarefa
          </Button>
        </>
      }
    >
      <form id="new-task-form" onSubmit={submit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-[var(--color-muted)]">
            O que precisa ser feito?
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Gravar aula 0.0 para academy"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <TaskTypeSelect value={category} onChange={setCategory} />
          </Field>
          <Field label="Responsável">
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="h-10 w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            >
              <option value="">Ninguém</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === currentUserId ? `${m.name} (eu)` : m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Vincular a negócio (opcional)">
            <select
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              className="h-10 w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            >
              <option value="">Nenhum</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prazo">
            <Input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </Field>
          <Field label="Prioridade">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="h-10 w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            >
              {(Object.keys(TASK_PRIORITY) as TaskPriority[]).map((p) => (
                <option key={p} value={p}>
                  {TASK_PRIORITY[p].label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </form>
    </Dialog>
  );
}
