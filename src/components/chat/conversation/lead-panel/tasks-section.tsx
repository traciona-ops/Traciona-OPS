"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_TASK_TYPE,
  TaskTypeBadge,
  TaskTypeSelect,
} from "@/components/crm/task-type";
import { createTask, toggleTask } from "@/app/(dashboard)/crm/actions";
import { SECTION_LABEL, type RunMutation } from "@/components/chat/conversation/lead-panel/ui";
import type { LeadContext } from "@/components/chat/types";
import type { TaskCategory } from "@/lib/types";

export function TasksSection({
  leadId,
  tasks,
  currentUserId,
  run,
}: {
  leadId: string;
  tasks: LeadContext["tasks"];
  currentUserId: string;
  run: RunMutation;
}) {
  const [taskTitle, setTaskTitle] = useState("");
  const [taskType, setTaskType] = useState<TaskCategory>(DEFAULT_TASK_TYPE);
  const openTasks = tasks.filter((t) => !t.done);

  return (
    <div>
      <label className={SECTION_LABEL}>
        Tarefas {openTasks.length > 0 && `(${openTasks.length})`}
      </label>
      <div className="mb-2 space-y-1.5">
        {tasks.map((t) => (
          <div key={t.id} className="flex items-center gap-2 text-sm">
            <button
              onClick={() => run(() => toggleTask(t.id, leadId, !t.done))}
              aria-label={
                t.done
                  ? "Marcar tarefa como pendente"
                  : "Marcar tarefa como concluída"
              }
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                t.done
                  ? "border-[var(--color-success)] bg-[var(--color-success)] text-[var(--color-primary-foreground)]"
                  : "border-[var(--color-border-strong)]"
              }`}
            >
              {t.done && <Check className="h-3 w-3" />}
            </button>
            <span
              className={`min-w-0 flex-1 truncate text-xs ${
                t.done ? "text-[var(--color-muted-2)] line-through" : ""
              }`}
            >
              {t.title}
            </span>
            <TaskTypeBadge value={t.category} />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5">
        <TaskTypeSelect
          value={taskType}
          onChange={setTaskType}
          className="h-8 w-28 shrink-0"
        />
        <Input
          value={taskTitle}
          onChange={(e) => setTaskTitle(e.target.value)}
          placeholder="Nova tarefa (Enter)"
          className="h-8 flex-1 text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter" && taskTitle.trim()) {
              run(() =>
                createTask({
                  leadId,
                  title: taskTitle.trim(),
                  category: taskType,
                  assigneeId: currentUserId,
                })
              );
              setTaskTitle("");
            }
          }}
        />
      </div>
    </div>
  );
}
