"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { getSessionMetrics } from "@/app/(dashboard)/crm/session-actions";
import { fmtDuration } from "@/lib/chat-sessions/format";
import type { SessionMetrics } from "@/lib/chat-sessions/types";

const RANGES = [
  { days: 1, label: "Hoje" },
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
] as const;

/** Dashboard pessoal do operador — só os seus atendimentos. */
export function MyDashboard({
  userName,
  numberId,
}: {
  userName: string;
  numberId?: string | null;
}) {
  const [range, setRange] = useState(7);
  const [metrics, setMetrics] = useState<SessionMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await getSessionMetrics({
      scope: "me",
      rangeDays: range,
      numberId: numberId || null,
    });
    setLoading(false);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    setMetrics(r.metrics);
  }, [range, numberId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-[var(--color-background)]">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Minha dashboard</h1>
          <p className="text-xs text-[var(--color-muted-2)]">
            {userName} — só os seus atendimentos
          </p>
        </div>
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setRange(r.days)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                range === r.days
                  ? "bg-[var(--color-foreground)] text-[var(--color-background)]"
                  : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
              }`}
            >
              {r.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void load()}
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
            aria-label="Atualizar"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        {loading && !metrics ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted)]" />
          </div>
        ) : error ? (
          <p className="text-sm text-[var(--color-danger)]">{error}</p>
        ) : metrics ? (
          <div className="mx-auto flex max-w-4xl flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                tone="success"
                title="Aguardando você"
                value={String(metrics.waiting_for_me)}
                foot={`espera média ${fmtDuration(metrics.avg_wait_seconds)}`}
              />
              <StatCard
                tone="accent"
                title="Em atendimento"
                value={String(metrics.active)}
                foot={`${metrics.unread} não lidas`}
              />
              <StatCard
                title="Aguardando cliente"
                value={String(metrics.paused)}
                foot="pausados"
              />
              <StatCard
                tone="success"
                title="Finalizados"
                value={String(metrics.closed_in_range)}
                foot={`últimos ${metrics.range_days} dias`}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Kpi
                title="Sua espera média"
                hint="até assumir"
                value={fmtDuration(metrics.avg_wait_seconds)}
              />
              <Kpi
                title="Tempo médio de atendimento"
                hint="início ao fim"
                value={fmtDuration(metrics.avg_handle_seconds)}
              />
              <Kpi
                title="Sua nota (CSAT)"
                hint="sem avaliações ainda"
                value={metrics.csat_avg != null ? String(metrics.csat_avg) : "—"}
              />
            </div>

            <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <h2 className="text-sm font-semibold">
                Minhas metas — últimos {metrics.range_days} dias
              </h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <Goal label="SLA no prazo" goal="90%" value={metrics.sla_on_time_pct != null ? `${metrics.sla_on_time_pct}%` : "—"} />
                <Goal label="Tempo de espera" goal="5 min" value={fmtDuration(metrics.avg_wait_seconds)} />
                <Goal label="CSAT" goal="4.8" value={metrics.csat_avg != null ? String(metrics.csat_avg) : "—"} />
              </div>
              <p className="mt-3 text-[11px] text-[var(--color-muted-2)]">
                Sem dados no período não conta contra você.
              </p>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  foot,
  tone,
}: {
  title: string;
  value: string;
  foot: string;
  tone?: "success" | "accent";
}) {
  const bg =
    tone === "success"
      ? "bg-[var(--color-success)]/15 border-[var(--color-success)]/30"
      : tone === "accent"
        ? "bg-[var(--chat-accent)]/12 border-[var(--chat-accent)]/25"
        : "bg-[var(--color-surface)] border-[var(--color-border)]";
  return (
    <div className={`rounded-[var(--radius-card)] border p-4 ${bg}`}>
      <p className="text-xs font-medium text-[var(--color-muted)]">{title}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-[11px] text-[var(--color-muted-2)]">{foot}</p>
    </div>
  );
}

function Kpi({ title, hint, value }: { title: string; hint: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="text-xs font-medium">{title}</p>
      <p className="text-[11px] text-[var(--color-muted-2)]">{hint}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Goal({ label, goal, value }: { label: string; goal: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium">{label}</p>
      <p className="text-[11px] text-[var(--color-muted-2)]">meta {goal}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
