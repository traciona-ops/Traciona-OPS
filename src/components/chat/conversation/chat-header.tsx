"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ExternalLink,
  EyeOff,
  Headset,
  History,
  Loader2,
  Phone,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { formatPhone } from "@/lib/utils/ui";
import { fmtDateBR, fmtTimeBR } from "@/lib/utils/dates";
import {
  fetchLeadHistory,
  markConversationUnread,
} from "@/app/(dashboard)/crm/whatsapp-actions";
import {
  addLeadToPipeline,
  updateLead,
} from "@/app/(dashboard)/crm/actions";
import type { ChatLead } from "@/components/chat/types";
import { SessionActions } from "@/components/chat/conversation/session-actions";
import type { ActiveSession } from "@/hooks/use-active-session";

type HistoryEvent = { id: string; at: string; text: string; by: string | null };

/** Popover de "histórico de movimentação" (etapas e transferências do lead). */
function HistoryPopover({ leadId }: { leadId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<HistoryEvent[]>([]);

  async function toggle() {
    setOpen((o) => !o);
    if (open) return;
    setLoading(true);
    const r = await fetchLeadHistory(leadId);
    setLoading(false);
    if ("events" in r) setEvents(r.events);
  }

  return (
    <div className="relative hidden sm:block">
      <button
        onClick={toggle}
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
          open
            ? "bg-[var(--color-surface-2)] text-[var(--color-foreground)]"
            : "text-[var(--color-muted-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
        }`}
        title="Histórico de movimentação"
        aria-label="Histórico de movimentação"
      >
        <History className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-20 w-80 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-2 shadow-xl">
            <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-2)]">
              Histórico de movimentação
            </p>
            <div className="max-h-72 space-y-0.5 overflow-y-auto">
              {loading && (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--color-muted)]" />
                </div>
              )}
              {!loading && events.length === 0 && (
                <p className="px-2 py-4 text-xs text-[var(--color-muted-2)]">
                  Nenhuma movimentação registrada ainda — as trocas de etapa e
                  transferências vão aparecer aqui.
                </p>
              )}
              {events.map((e) => (
                <div
                  key={e.id}
                  className="rounded-lg px-2 py-1.5 hover:bg-[var(--color-surface-2)]"
                >
                  <p className="text-xs">{e.text}</p>
                  <p className="text-[11px] text-[var(--color-muted-2)]">
                    {fmtDateBR(e.at)} {fmtTimeBR(e.at)}
                    {e.by ? ` · por ${e.by}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function ChatHeader({
  lead,
  owner,
  currentUserId,
  inPipeline,
  contactTyping,
  session,
  onSessionChanged,
  onSync,
  onOwnerChanged,
  onDelete,
  onBack,
}: {
  lead: ChatLead;
  /** Responsável atual (pro status de atendimento). */
  owner?: { id: string; name: string } | null;
  currentUserId?: string;
  /** false = conversa sem card no funil → mostra "Adicionar ao funil". */
  inPipeline?: boolean;
  contactTyping: boolean;
  /** Sessão de atendimento aberta (filas híbridas). */
  session?: ActiveSession | null;
  onSessionChanged?: () => void | Promise<void>;
  /** Sincronizar: o dock re-busca o thread; sem callback, refresh da página. */
  onSync?: () => void | Promise<void>;
  onOwnerChanged?: () => void | Promise<void>;
  /** Excluir a conversa (só aparece quando fornecido — perfil com permissão). */
  onDelete?: () => void | Promise<void>;
  /** Mobile: volta pra lista de conversas (botão ← só aparece em telas pequenas). */
  onBack?: () => void;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [addingPipe, setAddingPipe] = useState(false);

  async function startService() {
    if (!currentUserId || starting) return;
    setStarting(true);
    await updateLead(lead.id, { owner_id: currentUserId });
    setStarting(false);
    router.refresh();
    await onOwnerChanged?.();
  }

  async function addToPipeline() {
    if (addingPipe) return;
    setAddingPipe(true);
    await addLeadToPipeline(lead.id);
    setAddingPipe(false);
    router.refresh();
    await onOwnerChanged?.();
  }

  async function doSync() {
    if (syncing) return;
    setSyncing(true);
    if (onSync) await onSync();
    else router.refresh();
    setTimeout(() => setSyncing(false), 600);
  }

  const iconBtn =
    "hidden h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted-2)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] sm:flex";

  return (
    <header className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-2.5 py-2.5 sm:px-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Voltar pra lista de conversas"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] sm:hidden"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <Avatar name={lead.name} src={lead.avatar_url} size={36} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium">{lead.name}</p>
            {session ? (
              <span
                className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  session.status === "waiting"
                    ? "bg-[var(--color-warning)]/15 text-[var(--color-warning)]"
                    : session.status === "paused"
                      ? "bg-[var(--color-muted)]/20 text-[var(--color-muted)]"
                      : "bg-[var(--color-success)]/12 text-[var(--color-success)]"
                }`}
              >
                <Headset className="h-3 w-3" />
                {session.status === "waiting" && (
                  <>
                    <span className="sm:hidden">Aguardando</span>
                    <span className="hidden sm:inline">Aguardando na fila</span>
                  </>
                )}
                {session.status === "active" && (
                  <>
                    <span className="hidden sm:inline">Em atendimento&nbsp;·&nbsp;</span>
                    {session.assignee_id === currentUserId
                      ? "você"
                      : (session.assignee_name ?? "—").split(" ")[0]}
                  </>
                )}
                {session.status === "paused" && (
                  <>
                    <span className="sm:hidden">Pausado</span>
                    <span className="hidden sm:inline">Pausado · aguardando cliente</span>
                  </>
                )}
              </span>
            ) : (
              owner !== undefined &&
              (owner ? (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-success)]/12 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-success)]">
                  <Headset className="h-3 w-3" />
                  <span className="hidden sm:inline">Em atendimento&nbsp;·&nbsp;</span>
                  {owner.id === currentUserId ? "você" : owner.name.split(" ")[0]}
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-warning)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-warning)]">
                  <span className="sm:hidden">Aguardando</span>
                  <span className="hidden sm:inline">Aguardando atendimento</span>
                </span>
              ))
            )}
          </div>
          {contactTyping ? (
            <p className="text-xs font-medium italic text-[var(--color-success)]">
              digitando…
            </p>
          ) : (
            lead.phone && (
              <p className="hidden items-center gap-1 text-xs text-[var(--color-muted)] sm:flex">
                <Phone className="h-3 w-3" />
                {formatPhone(lead.phone)}
              </p>
            )
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {session && (
          <SessionActions
            session={session}
            currentUserId={currentUserId}
            onChanged={onSessionChanged}
          />
        )}
        {inPipeline === false && (
          <button
            onClick={addToPipeline}
            disabled={addingPipe}
            className="mr-1 flex h-8 items-center gap-1.5 rounded-lg border border-[var(--color-primary)]/40 px-2 text-xs font-semibold text-[var(--color-primary)] transition hover:bg-[var(--color-primary)]/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] sm:px-3"
            title="Criar o card deste contato no funil de vendas"
            aria-label="Adicionar ao funil"
          >
            {addingPipe ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">Adicionar ao funil</span>
          </button>
        )}
        {!session && owner === null && currentUserId && (
          <button
            onClick={startService}
            disabled={starting}
            className="mr-1 flex h-8 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-2 text-xs font-semibold text-[var(--color-primary-foreground)] transition hover:bg-[var(--color-primary-hover)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] sm:px-3"
            title="Iniciar atendimento"
            aria-label="Iniciar atendimento"
          >
            {starting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Headset className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">Iniciar atendimento</span>
            <span className="sm:hidden">Atender</span>
          </button>
        )}
        <button
          onClick={async () => {
            await markConversationUnread(lead.id);
            router.refresh();
          }}
          className={iconBtn}
          title="Marcar como não lida"
          aria-label="Marcar como não lida"
        >
          <EyeOff className="h-4 w-4" />
        </button>
        <button
          onClick={doSync}
          className={iconBtn}
          title="Sincronizar mensagens"
          aria-label="Sincronizar mensagens"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
        </button>
        <HistoryPopover leadId={lead.id} />
        <Link
          href={`/crm/leads/${lead.id}`}
          className="hidden h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted-2)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] sm:flex"
          title="Abrir página do lead"
          aria-label="Abrir página do lead"
        >
          <ExternalLink className="h-4 w-4" />
        </Link>
        {onDelete && (
          <button
            onClick={onDelete}
            className="hidden h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted-2)] transition hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] sm:flex"
            title="Excluir conversa"
            aria-label="Excluir conversa"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </header>
  );
}
