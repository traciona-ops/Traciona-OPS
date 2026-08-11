import type { LeadTask, Profile } from "@/lib/types";

export type ViewTask = LeadTask & {
  lead?: { id: string; name: string } | null;
  assignee?: { id: string; name: string; avatar_url: string | null } | null;
};

// Filtro único: cards de status e chips rápidos apontam pro mesmo estado.
export type TaskFilter =
  | "todas"
  | "concluidas"
  | "pendentes"
  | "andamento"
  | "atrasadas"
  | "minhas";

export type ViewMode = "lista" | "quadro";

export type TasksViewProps = {
  tasks: ViewTask[];
  team: Profile[];
  leads: { id: string; name: string }[];
  currentUserId: string;
  userName: string;
};

export type TaskCounts = Record<TaskFilter, number>;
