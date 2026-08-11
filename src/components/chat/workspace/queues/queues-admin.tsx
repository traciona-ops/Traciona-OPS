"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, UsersRound } from "lucide-react";
import {
  createQueue,
  deactivateQueue,
  listQueues,
  updateQueue,
  type QueueRow,
} from "@/app/(dashboard)/crm/session-actions";
import type { ChatQueueMode } from "@/lib/chat-sessions/types";
import type { Sector } from "@/lib/types";
import type { BusinessHours } from "@/lib/chat-sessions/business-hours";

const SECTORS: { id: Sector | ""; label: string }[] = [
  { id: "", label: "Sem setor" },
  { id: "vendas", label: "Vendas" },
  { id: "suporte", label: "Suporte" },
  { id: "financeiro", label: "Financeiro" },
];

const DEFAULT_HOURS: BusinessHours = {
  tz: "America/Sao_Paulo",
  days: {
    "1": [["09:00", "18:00"]],
    "2": [["09:00", "18:00"]],
    "3": [["09:00", "18:00"]],
    "4": [["09:00", "18:00"]],
    "5": [["09:00", "18:00"]],
  },
  holidays: [],
};

/** Admin de filas de atendimento (ACD / pull + SLA + CSAT). */
export function QueuesAdmin() {
  const [queues, setQueues] = useState<QueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<QueueRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await listQueues();
    if (r.error) setError(r.error);
    setQueues(r.queues ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate() {
    const name = prompt("Nome da fila:");
    if (!name?.trim()) return;
    setBusy(true);
    const r = await createQueue({ name: name.trim(), mode: "pull" });
    setBusy(false);
    if (r && "error" in r && r.error) {
      alert(r.error);
      return;
    }
    setCreating(false);
    await load();
    if (r && "queue" in r && r.queue) setEditing(r.queue);
  }

  const active = (queues ?? []).filter((q) => q.active);

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-[var(--color-background)]">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-surface-2)]">
            <UsersRound className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              Filas de atendimento
            </h1>
            <p className="text-xs text-[var(--color-muted-2)]">
              Distribua automaticamente o atendimento das conversas por carga
              operacional
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void onCreate()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-foreground)] px-3 py-2 text-xs font-semibold text-[var(--color-background)] transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Nova fila
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        {queues === null ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted)]" />
          </div>
        ) : error ? (
          <p className="text-sm text-[var(--color-danger)]">{error}</p>
        ) : active.length === 0 && !creating ? (
          <div className="mx-auto flex max-w-md flex-col items-center rounded-[var(--radius-card)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] px-6 py-14 text-center">
            <UsersRound className="h-12 w-12 text-[var(--color-muted-2)]" />
            <h2 className="mt-4 text-base font-semibold">Nenhuma fila de atendimento</h2>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Enquanto não houver fila ativa para um número, as conversas
              continuam chegando sem atendente definido — exatamente como
              funciona hoje.
            </p>
            <button
              type="button"
              onClick={() => void onCreate()}
              className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-foreground)] px-4 py-2.5 text-sm font-semibold text-[var(--color-background)]"
            >
              <Plus className="h-4 w-4" />
              Criar primeira fila
            </button>
          </div>
        ) : (
          <div className="mx-auto grid max-w-4xl gap-3">
            {(queues ?? []).map((q) => (
              <article
                key={q.id}
                className={`rounded-[var(--radius-card)] border bg-[var(--color-surface)] p-4 ${
                  q.active
                    ? "border-[var(--color-border)]"
                    : "border-[var(--color-border)] opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">{q.name}</h2>
                    <p className="mt-0.5 text-xs text-[var(--color-muted-2)]">
                      {q.sector ?? "sem setor"} · {q.mode === "acd" ? "ACD" : "Pull"} · SLA{" "}
                      {Math.round(q.sla_first_response_seconds / 60)}min
                      {q.csat_enabled ? " · CSAT" : ""}
                      {!q.active ? " · inativa" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing(q)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-2)]"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Configurar
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <QueueEditor
          queue={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function QueueEditor({
  queue,
  onClose,
  onSaved,
}: {
  queue: QueueRow;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState(queue.name);
  const [sector, setSector] = useState<Sector | "">(queue.sector ?? "");
  const [mode, setMode] = useState<ChatQueueMode>(queue.mode);
  const [slaFirst, setSlaFirst] = useState(queue.sla_first_response_seconds);
  const [slaRes, setSlaRes] = useState(queue.sla_resolution_seconds ?? 0);
  const [csat, setCsat] = useState(queue.csat_enabled);
  const [csatDelay, setCsatDelay] = useState(queue.csat_delay_seconds);
  const [vip, setVip] = useState(queue.vip_bypass);
  const [active, setActive] = useState(queue.active);
  const [hours, setHours] = useState<BusinessHours>(
    queue.business_hours ?? DEFAULT_HOURS
  );
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const r = await updateQueue(queue.id, {
      name: name.trim(),
      sector: sector || null,
      mode,
      sla_first_response_seconds: Number(slaFirst) || 300,
      sla_resolution_seconds: slaRes > 0 ? slaRes : null,
      csat_enabled: csat,
      csat_delay_seconds: Number(csatDelay) || 60,
      vip_bypass: vip,
      active,
      business_hours: hours,
    });
    setBusy(false);
    if (r && "error" in r && r.error) {
      alert(r.error);
      return;
    }
    await onSaved();
  }

  async function deactivate() {
    if (!confirm(`Desativar a fila "${queue.name}"?`)) return;
    setBusy(true);
    await deactivateQueue(queue.id);
    setBusy(false);
    await onSaved();
  }

  const dayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Configurar fila"
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[var(--radius-card)] bg-[var(--color-surface)] shadow-xl sm:rounded-[var(--radius-card)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-sm font-semibold">Expediente, metas e SLA</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[var(--color-muted)] hover:underline"
          >
            Fechar
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <Field label="Nome">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Setor">
              <select
                value={sector}
                onChange={(e) => setSector(e.target.value as Sector | "")}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              >
                {SECTORS.map((s) => (
                  <option key={s.id || "none"} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Modo">
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as ChatQueueMode)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              >
                <option value="pull">Pull (operador assume)</option>
                <option value="acd">ACD (distribuição automática)</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="SLA 1ª resposta (seg)">
              <input
                type="number"
                min={30}
                value={slaFirst}
                onChange={(e) => setSlaFirst(Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </Field>
            <Field label="SLA resolução (seg, 0 = off)">
              <input
                type="number"
                min={0}
                value={slaRes}
                onChange={(e) => setSlaRes(Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </Field>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Enviar pesquisa de satisfação (CSAT)</span>
            <input type="checkbox" checked={csat} onChange={(e) => setCsat(e.target.checked)} />
          </label>
          {csat && (
            <Field label="Atraso do CSAT (segundos)">
              <input
                type="number"
                min={0}
                value={csatDelay}
                onChange={(e) => setCsatDelay(Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </Field>
          )}
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>VIP bypass (Proposta → owner)</span>
            <input type="checkbox" checked={vip} onChange={(e) => setVip(e.target.checked)} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Fila ativa</span>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          </label>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-2)]">
              Expediente
            </p>
            <div className="space-y-1.5">
              {dayLabels.map((label, i) => {
                const key = String(i);
                const slot = hours.days?.[key]?.[0];
                const on = !!slot;
                return (
                  <div key={key} className="flex items-center gap-2 text-xs">
                    <label className="flex w-14 items-center gap-1">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => {
                          const days = { ...(hours.days ?? {}) };
                          if (e.target.checked) days[key] = [["09:00", "18:00"]];
                          else delete days[key];
                          setHours({ ...hours, days });
                        }}
                      />
                      {label}
                    </label>
                    {on && (
                      <>
                        <input
                          type="time"
                          value={slot[0]}
                          onChange={(e) => {
                            const days = { ...(hours.days ?? {}) };
                            days[key] = [[e.target.value, slot[1]]];
                            setHours({ ...hours, days });
                          }}
                          className="rounded border border-[var(--color-border)] bg-[var(--color-background)] px-1 py-0.5"
                        />
                        <span className="text-[var(--color-muted-2)]">às</span>
                        <input
                          type="time"
                          value={slot[1]}
                          onChange={(e) => {
                            const days = { ...(hours.days ?? {}) };
                            days[key] = [[slot[0], e.target.value]];
                            setHours({ ...hours, days });
                          }}
                          className="rounded border border-[var(--color-border)] bg-[var(--color-background)] px-1 py-0.5"
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] px-4 py-3">
          <button
            type="button"
            onClick={() => void deactivate()}
            disabled={busy}
            className="text-xs font-medium text-[var(--color-danger)] hover:underline disabled:opacity-50"
          >
            Desativar fila
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !name.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-foreground)] px-3 py-2 text-xs font-semibold text-[var(--color-background)] disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-[var(--color-muted)]">{label}</span>
      {children}
    </label>
  );
}
