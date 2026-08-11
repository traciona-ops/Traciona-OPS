"use client";

import type { StatusCard } from "./helpers";
import type { TaskFilter } from "./types";

type TasksStatusCardsProps = {
  cards: StatusCard[];
  filter: TaskFilter;
  setFilter: (f: TaskFilter) => void;
};

export function TasksStatusCards({
  cards,
  filter,
  setFilter,
}: TasksStatusCardsProps) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-5">
      {cards.map((c) => {
        const Icon = c.icon;
        const active = filter === c.key;
        return (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={`card p-3.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
              active
                ? "border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/30"
                : "card-hover"
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: c.color }}
              >
                {c.label}
              </span>
              <span
                className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{
                  backgroundColor: `color-mix(in srgb, ${c.color} 12%, transparent)`,
                }}
              >
                <Icon className="h-3.5 w-3.5" style={{ color: c.color }} />
              </span>
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
              {c.count}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-[var(--color-muted-2)]">
              {c.sub}
            </p>
          </button>
        );
      })}
    </div>
  );
}
