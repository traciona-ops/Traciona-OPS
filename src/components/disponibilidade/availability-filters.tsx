"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { Profile } from "@/lib/types";

// Filtros da consulta de disponibilidade (modelo Groner): os valores viram
// query params — a página recalcula os horários no servidor.
export function AvailabilityFilters({
  team,
  initial,
}: {
  team: Profile[];
  initial: {
    userId: string;
    date: string;
    duration: number;
    days: number;
    hourMin: string;
    hourMax: string;
  };
}) {
  const router = useRouter();
  const [userId, setUserId] = useState(initial.userId);
  const [date, setDate] = useState(initial.date);
  const [duration, setDuration] = useState(initial.duration);
  const [days, setDays] = useState(initial.days);
  const [hourMin, setHourMin] = useState(initial.hourMin);
  const [hourMax, setHourMax] = useState(initial.hourMax);

  function apply() {
    const qs = new URLSearchParams({
      u: userId,
      d: date,
      dur: String(duration),
      days: String(days),
      h1: hourMin,
      h2: hourMax,
    });
    router.push(`/disponibilidade?${qs.toString()}`);
  }

  const inputCls =
    "h-10 w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none";

  return (
    <div className="card h-fit w-full shrink-0 space-y-4 p-4 lg:w-80">
      <p className="text-sm font-semibold">Filtros</p>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold" htmlFor="av-user">
          Usuário
        </label>
        <select
          id="av-user"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className={inputCls}
        >
          {team.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold" htmlFor="av-date">
          Data inicial
        </label>
        <input
          id="av-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={inputCls}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold" htmlFor="av-dur">
          Duração em minutos
        </label>
        <input
          id="av-dur"
          type="number"
          min={15}
          max={480}
          step={15}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value) || 60)}
          className={inputCls}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold" htmlFor="av-days">
          Quantos dias ({days})
        </label>
        <input
          id="av-days"
          type="range"
          min={1}
          max={28}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="w-full accent-[var(--color-primary)]"
        />
        <div className="flex justify-between text-[11px] text-[var(--color-muted-2)]">
          <span>1</span>
          <span>7</span>
          <span>14</span>
          <span>21</span>
          <span>28</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold" htmlFor="av-h1">
            Hora mín.
          </label>
          <input
            id="av-h1"
            type="time"
            value={hourMin}
            onChange={(e) => setHourMin(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold" htmlFor="av-h2">
            Hora máx.
          </label>
          <input
            id="av-h2"
            type="time"
            value={hourMax}
            onChange={(e) => setHourMax(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      <button
        onClick={apply}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] text-sm font-semibold text-[var(--color-on-accent)] transition hover:bg-[var(--color-primary-hover)]"
      >
        <Search className="h-4 w-4" />
        Filtrar
      </button>
    </div>
  );
}
