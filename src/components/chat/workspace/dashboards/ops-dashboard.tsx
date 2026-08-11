"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { getSessionMetrics } from "@/app/(dashboard)/crm/session-actions";
import { fmtDuration } from "@/lib/chat-sessions/format";
import type { SessionMetrics } from "@/lib/chat-sessions/types";

const RANGES = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
] as const;

/** Dashboard operacional da equipe / número. */
export function OpsDashboard({
  numberLabel,
  numberId,
}: {
  numberLabel: string;
  numberId?: string | null;
}) {
  const [range, setRange] = useState(30);
  const [metrics, setMetrics] = useState<SessionMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await getSessionMetrics({
      scope: "team",
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
          <h1 className="text-lg font-semibold tracking-tight">
            Dashboard de atendimentos
          </h1>
          <p className="text-xs text-[var(--color-muted-2)]">
            Número: {numberLabel}
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
          <div className="mx-auto flex max-w-5xl flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card
                title="Iniciados no período"
                value={String(metrics.started_in_range)}
                foot={`últimos ${metrics.range_days} dias`}
              />
              <Card
                tone="danger"
                title="Aguardando atendimento"
                value={String(metrics.waiting)}
                foot={`espera média ${fmtDuration(metrics.avg_wait_seconds)} · maior ${fmtDuration(metrics.max_wait_seconds)}`}
              />
              <Card
                tone="accent"
                title="Em atendimento"
                value={String(metrics.active)}
                foot={`${metrics.paused} pausados`}
              />
              <Card
                tone="success"
                title="Finalizados no período"
                value={String(metrics.closed_in_range)}
                foot="encerrados manualmente"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi title="Tempo médio de espera" hint="até assumir" value={fmtDuration(metrics.avg_wait_seconds)} />
              <Kpi title="Tempo médio de atendimento" hint="tempo útil" value={fmtDuration(metrics.avg_handle_seconds)} />
              <Kpi title="% SLA no prazo" hint="1ª resposta ≤ 5 min" value={metrics.sla_on_time_pct != null ? `${metrics.sla_on_time_pct}%` : "—"} />
              <Kpi title="Nota média (CSAT)" hint="sem avaliações no período" value={metrics.csat_avg != null ? String(metrics.csat_avg) : "—"} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Mini label="Aguardando cliente" value={metrics.paused} />
              <Mini label="Pausadas" value={metrics.paused} />
              <Mini label="Sem atendente" value={metrics.unassigned} danger />
              <Mini label="Não lidas" value={metrics.unread} warn />
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <Panel title="Atendimentos por agente">
                {metrics.by_agent.length === 0 ? (
                  <Empty>Sem atendimentos atribuídos.</Empty>
                ) : (
                  <ul className="space-y-2">
                    {metrics.by_agent.map((a) => (
                      <li key={a.user_id} className="flex justify-between text-sm">
                        <span>{a.name}</span>
                        <span className="font-semibold">{a.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Conversas ativas por setor">
                {metrics.by_sector.length === 0 ? (
                  <Empty>Nenhuma conversa ativa.</Empty>
                ) : (
                  <ul className="space-y-2">
                    {metrics.by_sector.map((s) => (
                      <li key={s.sector} className="flex justify-between text-sm">
                        <span className="capitalize">{s.sector.replace("_", " ")}</span>
                        <span className="font-semibold">{s.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Disponibilidade dos atendentes">
                <p className="text-sm">
                  <span className="font-semibold text-[var(--color-success)]">
                    {metrics.presence.online} online
                  </span>
                  {" · "}
                  <span className="text-[var(--color-muted)]">
                    {metrics.presence.offline} offline
                  </span>
                </p>
                <p className="mt-2 text-[11px] text-[var(--color-muted-2)]">
                  Presença baseada no status do operador e no expediente da fila.
                </p>
              </Panel>
              <Panel title="CSAT por atendente">
                <Empty>Sem avaliações no período.</Empty>
              </Panel>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Card({
  title,
  value,
  foot,
  tone,
}: {
  title: string;
  value: string;
  foot: string;
  tone?: "danger" | "accent" | "success";
}) {
  const bg =
    tone === "danger"
      ? "bg-[var(--color-danger)]/12 border-[var(--color-danger)]/30"
      : tone === "accent"
        ? "bg-[var(--chat-accent)]/12 border-[var(--chat-accent)]/25"
        : tone === "success"
          ? "bg-[var(--color-success)]/15 border-[var(--color-success)]/30"
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

function Mini({
  label,
  value,
  danger,
  warn,
}: {
  label: string;
  value: number;
  danger?: boolean;
  warn?: boolean;
}) {
  const color = danger
    ? "text-[var(--color-danger)]"
    : warn
      ? "text-[var(--chat-accent)]"
      : "text-[var(--color-foreground)]";
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <p className="text-[11px] text-[var(--color-muted-2)]">{label}</p>
      <p className={`text-xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[var(--color-muted-2)]">{children}</p>;
}
