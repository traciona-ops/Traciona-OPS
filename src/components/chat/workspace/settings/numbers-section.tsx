"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Loader2,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Smartphone,
  Trash2,
} from "lucide-react";
import { WhatsappConnect } from "@/components/settings/whatsapp-connect";
import {
  addWaNumber,
  listWaNumbers,
  removeWaNumber,
  renameWaNumber,
  requestChatHistory,
} from "@/app/(dashboard)/settings/actions";
import {
  getChatSettings,
  updateChatSettings,
  type ChatSettings,
} from "@/app/(dashboard)/crm/whatsapp-actions";
import {
  listQueues,
  updateQueue,
  type QueueRow,
} from "@/app/(dashboard)/crm/session-actions";
import type { WaNumberRow } from "@/components/chat/types";

const TOGGLES = [
  {
    key: "signature" as const,
    title: "Assinatura da mensagem",
    desc: "Adiciona o nome do atendente ao final de cada mensagem enviada",
  },
  {
    key: "auto_create_card" as const,
    title: "Criar card automaticamente",
    desc: "Mensagem de número novo já cria o card no funil",
  },
  {
    key: "sessions_enabled" as const,
    title: "Sessões de atendimento (filas)",
    desc: "Abre ticket ao receber mensagem — o histórico do lead continua intacto",
  },
];

/** Números + toggles + sync + CSAT da fila padrão + danger zone. */
export function NumbersSection({
  connected,
  onOpenQueues,
}: {
  connected: boolean;
  onOpenQueues?: () => void;
}) {
  const [numbers, setNumbers] = useState<WaNumberRow[] | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [histMsg, setHistMsg] = useState<string | null>(null);
  const [defaultQueue, setDefaultQueue] = useState<QueueRow | null>(null);

  async function load(selectId?: string) {
    const r = await listWaNumbers();
    if ("numbers" in r) {
      setNumbers(r.numbers);
      setSelId((prev) => selectId ?? prev ?? r.numbers[0]?.id ?? null);
    }
  }

  useEffect(() => {
    void load();
    getChatSettings().then(setSettings);
    listQueues().then((r) => {
      const q = (r.queues ?? []).find((x) => x.active) ?? null;
      setDefaultQueue(q);
    });
  }, []);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const r = await addWaNumber(name.trim());
    setBusy(false);
    if (r && "error" in r && r.error) {
      setError(r.error);
      return;
    }
    setName("");
    await load(r && "id" in r ? r.id : undefined);
  }

  async function rename(n: WaNumberRow) {
    const novo = prompt("Nome do número:", n.name);
    if (!novo || !novo.trim() || novo.trim() === n.name) return;
    await renameWaNumber(n.id, novo.trim());
    void load();
  }

  async function remove(n: WaNumberRow) {
    if (
      !confirm(
        `Excluir o número "${n.name}"?\nAs conversas dele passam a responder pelo número principal.`
      )
    )
      return;
    await removeWaNumber(n.id);
    setSelId(null);
    void load();
  }

  async function toggle(key: keyof ChatSettings) {
    if (!settings) return;
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    const r = await updateChatSettings({ [key]: next[key] });
    if (r && "settings" in r && r.settings) setSettings(r.settings);
    else if (r && "error" in r) setSettings(settings);
  }

  async function toggleCsat() {
    if (!defaultQueue) return;
    const next = !defaultQueue.csat_enabled;
    setDefaultQueue({ ...defaultQueue, csat_enabled: next });
    const r = await updateQueue(defaultQueue.id, { csat_enabled: next });
    if (r && "queue" in r && r.queue) setDefaultQueue(r.queue);
  }

  async function forceHistory() {
    setSyncing(true);
    setHistMsg(null);
    const r = await requestChatHistory();
    setSyncing(false);
    if (r && typeof r === "object" && "error" in r && r.error) {
      setHistMsg(String(r.error));
    } else {
      setHistMsg("Pedido enviado — as conversas chegam em alguns minutos.");
    }
  }

  const selected = numbers?.find((n) => n.id === selId) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.9fr)]">
      <div className="space-y-4">
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <p className="px-4 pb-1 pt-3.5 text-sm font-semibold">Números</p>
          {numbers === null ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--color-muted)]" />
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border)]/60">
              {numbers.map((n) => (
                <div
                  key={n.id}
                  onClick={() => setSelId(n.id)}
                  role="button"
                  tabIndex={0}
                  className={`flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition ${
                    selId === n.id
                      ? "bg-[var(--chat-accent)]/8"
                      : "hover:bg-[var(--color-surface-2)]"
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--chat-accent)]/10">
                    <Smartphone className="h-4 w-4 text-[var(--chat-accent)]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{n.name}</span>
                      <span className="shrink-0 rounded bg-[var(--color-surface-2)] px-1.5 py-px text-[10px] font-bold uppercase text-[var(--color-muted)]">
                        WhatsApp
                      </span>
                      {n.env_default && (
                        <span className="shrink-0 rounded bg-[var(--chat-accent)]/10 px-1.5 py-px text-[10px] font-bold uppercase text-[var(--chat-accent)]">
                          Principal
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-[var(--color-muted-2)]">
                      {n.jid
                        ? `+${n.jid.split(":")[0].split("@")[0]}`
                        : connected && n.env_default
                          ? "Conectado"
                          : "Sem JID"}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void rename(n);
                      }}
                      title="Renomear"
                      aria-label={`Renomear ${n.name}`}
                      className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-[var(--color-muted-2)] hover:bg-[var(--color-surface-2)]"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {selId === n.id && (
                      <Check className="ml-0.5 h-4 w-4 text-[var(--chat-accent)]" />
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-[var(--color-border)] p-3">
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome do número"
                className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-background)] px-3 text-sm focus:border-[var(--chat-accent)] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void add()}
                disabled={busy || !name.trim()}
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-foreground)] px-3.5 text-sm font-semibold text-[var(--color-background)] disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Adicionar
              </button>
            </div>
            {error && (
              <p className="mt-2 rounded-lg bg-[var(--color-danger)]/10 px-3 py-1.5 text-xs text-[var(--color-danger)]">
                {error}
              </p>
            )}
          </div>
        </div>

        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Expediente, metas e SLA</p>
              <p className="mt-0.5 text-[11px] text-[var(--color-muted-2)]">
                Horário de funcionamento, contador de espera e CSAT da fila
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenQueues}
              className="rounded-lg border border-[var(--color-border-strong)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-2)]"
            >
              Configurar
            </button>
          </div>
        </div>

        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="text-sm font-semibold">Configurações do número</h2>
          <div className="mt-3 divide-y divide-[var(--color-border)]/60">
            {TOGGLES.map((opt) => {
              const on = !!settings?.[opt.key];
              return (
                <ToggleRow
                  key={opt.key}
                  title={opt.title}
                  desc={opt.desc}
                  on={on}
                  disabled={!settings}
                  onToggle={() => void toggle(opt.key)}
                />
              );
            })}
            <ToggleRow
              title="Enviar pesquisa de satisfação"
              desc={
                defaultQueue
                  ? `Agenda CSAT ao encerrar (fila ${defaultQueue.name})`
                  : "Crie uma fila ativa para habilitar o CSAT"
              }
              on={!!defaultQueue?.csat_enabled}
              disabled={!defaultQueue}
              onToggle={() => void toggleCsat()}
            />
          </div>
        </div>

        {selected && (
          <div className="rounded-[var(--radius-card)] border border-[var(--color-danger)]/40 bg-[var(--color-surface)] p-4">
            <p className="text-sm font-semibold text-[var(--color-danger)]">
              Zona de risco
            </p>
            <div className="mt-3 space-y-3">
              <DangerRow
                title="Forçar sincronização de conversas"
                desc="Busca o histórico recente do WhatsApp"
                action={
                  <button
                    type="button"
                    onClick={() => void forceHistory()}
                    disabled={syncing}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] px-2.5 text-xs font-medium disabled:opacity-50"
                  >
                    {syncing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Sincronizar
                  </button>
                }
              />
              {histMsg && (
                <p className="text-[11px] text-[var(--color-success)]">{histMsg}</p>
              )}
              {!selected.env_default && (
                <DangerRow
                  title="Excluir número"
                  desc="Remove permanentemente este número"
                  action={
                    <button
                      type="button"
                      onClick={() => void remove(selected)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--color-danger)] px-2.5 text-xs font-semibold text-white"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Excluir
                    </button>
                  }
                />
              )}
              <DangerRow
                title="Desconectar número"
                desc="Use o painel de conexão ao lado para encerrar a sessão"
                action={
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 text-xs text-[var(--color-muted)]">
                    <Power className="h-3.5 w-3.5" />
                    Via QR
                  </span>
                }
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {selected && (
          <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-success)]/15 text-[var(--color-success)]">
                <Smartphone className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">{selected.name}</p>
                <p className="text-[11px] text-[var(--color-muted-2)]">
                  Status da conexão
                </p>
              </div>
            </div>
            <WhatsappConnect
              key={selected.id}
              initialConnected={selected.env_default ? connected : false}
              embedded
              numberId={selected.env_default ? undefined : selected.id}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  title,
  desc,
  on,
  disabled,
  onToggle,
}: {
  title: string;
  desc: string;
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-[var(--color-muted-2)]">
          {desc}
        </p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        role="switch"
        aria-checked={on}
        aria-label={title}
        className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40 ${
          on ? "bg-[var(--color-success)]" : "bg-[var(--color-border-strong)]"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-[var(--color-surface)] shadow transition-all ${
            on ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function DangerRow({
  title,
  desc,
  action,
}: {
  title: string;
  desc: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-[11px] text-[var(--color-muted-2)]">{desc}</p>
      </div>
      {action}
    </div>
  );
}
