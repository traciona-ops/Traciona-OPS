"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Avatar } from "@/components/ui/avatar";
import { updateTask } from "@/app/(dashboard)/crm/actions";
import { TaskTypeBadge } from "@/components/crm/task-type";
import type { TaskStatus } from "@/lib/types";
import { TASK_STATUS } from "@/lib/data/labels";
import { BOARD_COLUMNS, priorityWeight } from "./helpers";
import { PriorityFlag } from "./priority-flag";
import type { ViewTask } from "./types";

type TasksBoardProps = {
  tasks: ViewTask[];
  today: string;
};

export function TasksBoard({ tasks, today }: TasksBoardProps) {
  const router = useRouter();
  const [items, setItems] = useState<ViewTask[]>(tasks);
  const [syncKey, setSyncKey] = useState("");
  const incoming = JSON.stringify(tasks.map((t) => `${t.id}${t.status}`));
  if (incoming !== syncKey) {
    setSyncKey(incoming);
    setItems(tasks);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const status = String(over.id) as TaskStatus;
    if (!BOARD_COLUMNS.includes(status)) return;
    const task = items.find((t) => t.id === active.id);
    if (!task || task.status === status) return;
    setItems((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, status, done: status === "concluida" }
          : t
      )
    );
    await updateTask(task.id, { status });
    router.refresh();
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid gap-4 md:grid-cols-3">
        {BOARD_COLUMNS.map((status) => {
          const list = items
            .filter((t) => (t.status ?? "a_fazer") === status)
            .sort(
              (a, b) =>
                priorityWeight(a.priority) - priorityWeight(b.priority) ||
                (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")
            );
          return (
            <BoardColumn
              key={status}
              status={status}
              list={list}
              today={today}
            />
          );
        })}
      </div>
    </DndContext>
  );
}

function BoardColumn({
  status,
  list,
  today,
}: {
  status: TaskStatus;
  list: ViewTask[];
  today: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = TASK_STATUS[status];

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[300px] flex-col rounded-xl bg-[var(--color-surface)]/60 p-2 transition-colors ${
        isOver ? "ring-2 ring-[var(--color-primary)]/40" : ""
      }`}
    >
      <div className="mb-2 flex items-center gap-2 px-1.5 pt-1">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: meta.color }}
        />
        <span className="text-sm font-semibold">{meta.label}</span>
        <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 text-xs text-[var(--color-muted)]">
          {list.length}
        </span>
      </div>
      <div className="flex-1 space-y-2">
        {list.map((t) => (
          <BoardCard key={t.id} task={t} today={today} />
        ))}
        {list.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-[var(--color-muted-2)]">
            Arraste tarefas pra cá
          </p>
        )}
      </div>
    </div>
  );
}

function BoardCard({ task, today }: { task: ViewTask; today: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id });
  const overdue = !task.done && task.due_date && task.due_date < today;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={
        transform
          ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
          : undefined
      }
      className={`card cursor-grab p-3 active:cursor-grabbing ${
        isDragging ? "z-50 opacity-80 shadow-xl" : "card-hover"
      }`}
    >
      <div className="flex items-start gap-1.5">
        <PriorityFlag task={task} />
        <p
          className={`min-w-0 flex-1 text-sm leading-snug ${
            task.done
              ? "text-[var(--color-muted-2)] line-through"
              : "font-medium"
          }`}
        >
          {task.title}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-muted)]">
        <TaskTypeBadge value={task.category} />
        {task.lead && (
          <Link
            href={`/crm/leads/${task.lead.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex max-w-32 items-center gap-0.5 truncate hover:text-[var(--color-primary)]"
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            <span className="truncate">{task.lead.name}</span>
          </Link>
        )}
        {task.due_date && (
          <span
            className={overdue ? "font-medium text-[var(--color-danger)]" : ""}
          >
            {new Date(task.due_date + "T00:00:00").toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
            })}
          </span>
        )}
        {task.assignee?.name && (
          <span className="ml-auto">
            <Avatar
              name={task.assignee.name}
              src={task.assignee.avatar_url}
              size={20}
            />
          </span>
        )}
      </div>
    </div>
  );
}
