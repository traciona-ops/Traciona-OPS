"use client";

import { useMemo, useState } from "react";
import {
  buildStatusCards,
  computeCounts,
  matchesFilter,
  matchesSearch,
  ymd,
} from "./helpers";
import { NewTaskDialog } from "./new-task-dialog";
import { TasksBoard } from "./tasks-board";
import { TasksEmptyState } from "./tasks-empty-state";
import { TasksList } from "./tasks-list";
import { TasksStatusCards } from "./tasks-status-cards";
import { TasksToolbar } from "./tasks-toolbar";
import type { TaskFilter, TasksViewProps, ViewMode } from "./types";

export type { ViewTask } from "./types";

export function TasksView({
  tasks,
  team,
  leads,
  currentUserId,
}: TasksViewProps) {
  const [filter, setFilter] = useState<TaskFilter>("minhas");
  const [q, setQ] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("lista");

  const today = ymd(new Date());
  const { counts, avgDelayDays } = computeCounts(
    tasks,
    today,
    currentUserId
  );
  const cards = buildStatusCards(counts, avgDelayDays);

  const query = q.trim().toLowerCase();

  const visible = useMemo(() => {
    const list = tasks.filter(
      (t) =>
        matchesFilter(t, filter, today, currentUserId) &&
        matchesSearch(t, query)
    );
    if (filter === "concluidas") {
      return list.sort((a, b) =>
        (b.completed_at ?? "").localeCompare(a.completed_at ?? "")
      );
    }
    return list.sort(
      (a, b) =>
        Number(a.done) - Number(b.done) ||
        (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, filter, query, today, currentUserId]);

  const boardTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          matchesSearch(t, query) &&
          (filter !== "minhas" || t.assignee_id === currentUserId)
      ),
    [tasks, query, filter, currentUserId]
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl p-6">
        <TasksStatusCards
          cards={cards}
          filter={filter}
          setFilter={setFilter}
        />

        <TasksToolbar
          visibleCount={visible.length}
          q={q}
          setQ={setQ}
          filter={filter}
          setFilter={setFilter}
          view={view}
          setView={setView}
          onNewTask={() => setNewOpen(true)}
        />

        {view === "quadro" ? (
          <TasksBoard tasks={boardTasks} today={today} />
        ) : visible.length === 0 ? (
          <TasksEmptyState onNewTask={() => setNewOpen(true)} />
        ) : (
          <TasksList tasks={visible} team={team} today={today} />
        )}
      </div>

      {newOpen && (
        <NewTaskDialog
          team={team}
          leads={leads}
          currentUserId={currentUserId}
          onClose={() => setNewOpen(false)}
        />
      )}
    </div>
  );
}
