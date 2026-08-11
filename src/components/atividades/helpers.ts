import {
  List,
  CheckCircle2,
  Clock3,
  RotateCw,
  CalendarX2,
  type LucideIcon,
} from "lucide-react";
import type { TaskPriority, TaskStatus } from "@/lib/types";
import { ymdBR } from "@/lib/utils/dates";
import type { TaskCounts, TaskFilter, ViewTask } from "./types";

// SEMPRE no fuso BR: toISOString() é UTC e, depois das 21h, empurrava a
// tarefa de hoje pra "Atrasadas" e a de amanhã pra "Hoje".
export const ymd = (d: Date) => ymdBR(d);

export const PRIORITY_ORDER: TaskPriority[] = [
  "urgente",
  "alta",
  "normal",
  "baixa",
];

export const BOARD_COLUMNS: TaskStatus[] = [
  "a_fazer",
  "em_andamento",
  "concluida",
];

export function computeCounts(
  tasks: ViewTask[],
  today: string,
  currentUserId: string
): { counts: TaskCounts; overdueList: ViewTask[]; avgDelayDays: number } {
  const overdueList = tasks.filter(
    (t) => !t.done && t.due_date && t.due_date < today
  );
  const avgDelayDays = overdueList.length
    ? Math.round(
        overdueList.reduce(
          (a, t) =>
            a +
            (new Date(`${today}T00:00:00`).getTime() -
              new Date(`${t.due_date}T00:00:00`).getTime()) /
              864e5,
          0
        ) / overdueList.length
      )
    : 0;

  const counts: TaskCounts = {
    todas: tasks.length,
    concluidas: tasks.filter((t) => t.done).length,
    pendentes: tasks.filter(
      (t) => !t.done && (t.status ?? "a_fazer") === "a_fazer"
    ).length,
    andamento: tasks.filter((t) => !t.done && t.status === "em_andamento")
      .length,
    atrasadas: overdueList.length,
    minhas: tasks.filter((t) => !t.done && t.assignee_id === currentUserId)
      .length,
  };

  return { counts, overdueList, avgDelayDays };
}

export function matchesFilter(
  t: ViewTask,
  filter: TaskFilter,
  today: string,
  currentUserId: string
): boolean {
  switch (filter) {
    case "concluidas":
      return t.done;
    case "pendentes":
      return !t.done && (t.status ?? "a_fazer") === "a_fazer";
    case "andamento":
      return !t.done && t.status === "em_andamento";
    case "atrasadas":
      return !t.done && !!t.due_date && t.due_date! < today;
    case "minhas":
      return !t.done && t.assignee_id === currentUserId;
    default:
      return true;
  }
}

export function matchesSearch(t: ViewTask, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${t.title} ${t.lead?.name ?? ""} ${t.assignee?.name ?? ""}`
    .toLowerCase()
    .includes(q);
}

export type StatusCard = {
  key: TaskFilter;
  label: string;
  count: number;
  sub: string;
  icon: LucideIcon;
  color: string;
};

export function buildStatusCards(
  counts: TaskCounts,
  avgDelayDays: number
): StatusCard[] {
  return [
    {
      key: "todas",
      label: "Todas",
      count: counts.todas,
      sub: "Todas as tarefas",
      icon: List,
      color: "var(--color-muted)",
    },
    {
      key: "concluidas",
      label: "Concluídas",
      count: counts.concluidas,
      sub: "Tarefas finalizadas",
      icon: CheckCircle2,
      color: "var(--color-success)",
    },
    {
      key: "pendentes",
      label: "Pendentes",
      count: counts.pendentes,
      sub: "Ainda não iniciadas",
      icon: Clock3,
      color: "var(--color-warning)",
    },
    {
      key: "andamento",
      label: "Em andamento",
      count: counts.andamento,
      sub: "Sendo executadas",
      icon: RotateCw,
      color: "var(--color-primary)",
    },
    {
      key: "atrasadas",
      label: "Atrasadas",
      count: counts.atrasadas,
      sub:
        counts.atrasadas > 0
          ? `média de ${avgDelayDays} dia${avgDelayDays === 1 ? "" : "s"} de atraso`
          : "Nada atrasado",
      icon: CalendarX2,
      color: "var(--color-danger)",
    },
  ];
}

export function priorityWeight(p: TaskPriority | null): number {
  return PRIORITY_ORDER.indexOf((p ?? "normal") as TaskPriority);
}
