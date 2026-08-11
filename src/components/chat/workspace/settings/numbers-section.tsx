"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Pencil, Plus, RefreshCw, Smartphone, Trash2 } from "lucide-react";
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
    desc: "Mensagem recebida de número novo já cria o card no funil (desligado = fica só no chat até você adicionar)",
  },
  {
    key: "sessions_enabled" as const,
    title: "Sessões de atendimento (filas)",
    desc: "Abre ticket ao receber mensagem, com fila Aguardando / Em atendimento / Pausado — o histórico do lead continua intacto",
  },
];

/** Números conectáveis, QR do selecionado, chaves do número e sync forçado. */
export function NumbersSection({ connected }: { connected: boolean }) {
  const [numbers, setNumbers] = useState<WaNumberRow[] | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [histMsg, setHistMsg] = useState<string | null>(null);

  async function load(selectId?: string) {
    const r = await listWaNumbers();
    if ("numbers" in r) {
      setNumbers(r.numbers);
      setSelId((prev) => selectId ?? prev ?? r.numbers[0]?.id ?? null);
    }
  }
  useEffect(() => {
    load();
    getChatSettings().then(setSettings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    load();
  }

  async function remove(n: WaNumberRow) {
    if (
      !confirm(
        `Remover o número "${n.name}"?\nAs conversas dele passam a responder pelo número principal.`
      )
    )
      return;
    await removeWaNumber(n.id);
    setSelId(null);
    load();
  }

  async function toggle(key: keyof ChatSettings) {
    if (!settings) return;
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next); // otimista
    const r = await updateChatSettings({ [key]: next[key] });
    if (r && "settings" in r && r.settings) setSettings(r.settings);
    else if (r && "error" in r) setSettings(settings); // desfaz
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
    <>
      <div className="card overflow-hidden p-0">
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
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--chat-accent)]/10">
                  <Smartphone className="h-4 w-4 text-[var(--chat-accent)]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{n.name}</span>
                    {n.env_default && (
                      <span className="shrink-0 rounded bg-[var(--chat-accent)]/10 px-1.5 py-px text-[11px] font-bold uppercase text-[var(--chat-accent)]">
                        Principal
                      </span>
                    )}
                  </span>
                  {n.jid && (
                    <span className="block truncate font-mono text-[11px] text-[var(--color-muted-2)]">
                      {n.jid.split(":")[0].split("@")[0]}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-0.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      rename(n);
                    }}
                    title="Renomear"
                    aria-label={`Renomear ${n.name}`}
                    className="flex min-h-9 min-w-9 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-muted-2)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {!n.env_default && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(n);
                      }}
                      title="Remover número"
                      aria-label={`Remover ${n.name}`}
                      className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-muted-2)] transition hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
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
              className="h-10 min-w-0 flex-1 rounded-[var(--radius-field)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm focus:border-[var(--chat-accent)] focus:outline-none"
            />
            <button
              onClick={add}
              disabled={busy || !name.trim()}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--chat-accent)] px-3.5 text-sm font-semibold text-[var(--color-primary-foreground)] transition hover:brightness-105 disabled:opacity-50"
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
            <p className="mt-2 rounded-[var(--radius-card)] bg-[var(--color-danger)]/10 px-3 py-1.5 text-xs text-[var(--color-danger)]">
              {error}
            </p>
          )}
        </div>
      </div>

      {/* conexão do número selecionado */}
      {selected && (
        <div className="card p-6">
          <WhatsappConnect
            key={selected.id}
            initialConnected={selected.env_default ? connected : false}
            embedded
            numberId={selected.env_default ? undefined : selected.id}
          />
        </div>
      )}

      <div className="card p-6">
        <h2 className="text-sm font-semibold">Configurações do número</h2>
        <div className="mt-3 divide-y divide-[var(--color-border)]/60">
          {TOGGLES.map((opt) => {
            const on = !!settings?.[opt.key];
            return (
              <div
                key={opt.key}
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{opt.title}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-[var(--color-muted-2)]">
                    {opt.desc}
                  </p>
                </div>
                <button
                  onClick={() => toggle(opt.key)}
                  disabled={!settings}
                  role="switch"
                  aria-checked={on}
                  aria-label={opt.title}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40 ${
                    on ? "bg-[var(--chat-accent)]" : "bg-[var(--color-border-strong)]"
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
          })}
        </div>
      </div>

      <div className="card flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Forçar sincronização de conversas</p>
          <p className="mt-0.5 text-[11px] text-[var(--color-muted-2)]">
            Busca o histórico recente do WhatsApp e salva no sistema
          </p>
          {histMsg && (
            <p className="mt-1 text-[11px] text-[var(--color-success)]">{histMsg}</p>
          )}
        </div>
        <button
          onClick={forceHistory}
          disabled={syncing}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-3 text-xs font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] disabled:opacity-50"
        >
          {syncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Sincronizar
        </button>
      </div>
    </>
  );
}
