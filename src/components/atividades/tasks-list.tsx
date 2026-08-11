"use client";

import type { Profile } from "@/lib/types";
import { TaskTableRow } from "./task-table-row";
import type { ViewTask } from "./types";

type TasksListProps = {
  tasks: ViewTask[];
  team: Profile[];
  today: string;
};

export function TasksList({ tasks, team, today }: TasksListProps) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-left text-[11px] uppercase tracking-wider text-[var(--color-muted-2)]">
            <th scope="col" className="px-4 py-2.5 font-semibold">
              Status
            </th>
            <th scope="col" className="px-3 py-2.5 font-semibold">
              Tarefa
            </th>
            <th scope="col" className="px-3 py-2.5 font-semibold">
              Prior.
            </th>
            <th scope="col" className="px-3 py-2.5 font-semibold">
              Tipo
            </th>
            <th scope="col" className="px-3 py-2.5 font-semibold">
              Responsável
            </th>
            <th scope="col" className="px-3 py-2.5 font-semibold">
              Prazo
            </th>
            <th scope="col" className="px-3 py-2.5 font-semibold">
              Concluída em
            </th>
            <th scope="col" className="px-3 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <TaskTableRow key={t.id} task={t} team={team} today={today} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
