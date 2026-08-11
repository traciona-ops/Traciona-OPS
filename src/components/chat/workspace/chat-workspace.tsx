"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useRole } from "@/components/context/role-context";
import { can } from "@/lib/permissions";
import { useChatAccent } from "@/hooks/use-chat-accent";
import { useConversations } from "@/hooks/use-conversations";
import { createClient } from "@/lib/supabase/client";
import {
  deleteConversation,
  fetchDockContext,
  fetchThread,
  getConnectionStatus,
  listChatNumbers,
  markAllConversationsRead,
  markConversationRead,
} from "@/app/(dashboard)/crm/whatsapp-actions";
import { ChatPanel } from "@/components/chat/conversation/chat-panel";
import { LeadPanel } from "@/components/chat/conversation/lead-panel";
import { ConversationList } from "@/components/chat/workspace/conversation-list/conversation-list";
import { ListHeader } from "@/components/chat/workspace/conversation-list/list-header";
import {
  NewConversation,
  type LeadHit,
} from "@/components/chat/workspace/conversation-list/new-conversation";
import { ChatSettings } from "@/components/chat/workspace/settings/chat-settings";
import { MetricsPanel } from "@/components/chat/workspace/metrics-panel";
import { EmptyState } from "@/components/chat/workspace/empty-state";
import type {
  ChatNumber,
  ChatThreadSeed,
  Conv,
  ConvFilters,
  LeadContext,
} from "@/components/chat/types";
import type { QuickReply, Sector, WhatsappMessage } from "@/lib/types";

/** Conversa "vazia" montada a partir de um lead que ainda não tem thread. */
function convFromLead(l: {
  id: string;
  name: string;
  phone: string | null;
  avatar_url: string | null;
  sector?: Sector;
  in_pipeline?: boolean;
}): Conv {
  return {
    lead_id: l.id,
    name: l.name,
    phone: l.phone,
    sector: l.sector ?? "vendas",
    avatar_url: l.avatar_url,
    is_client: false,
    in_pipeline: l.in_pipeline ?? true,
    owner_id: null,
    owner_name: null,
    last_body: null,
    last_at: "",
    last_direction: "out",
    last_media_type: null,
    number_id: null,
    unread: 0,
  };
}

function resolveInitialSelected(
  initialLeadId: string | undefined,
  initialConversations: Conv[] | undefined,
  initialThread: ChatThreadSeed | undefined
): Conv | null {
  if (!initialLeadId || !initialThread) return null;
  const conv = initialConversations?.find((c) => c.lead_id === initialLeadId);
  if (conv) return conv;
  const l = initialThread.context.lead;
  return convFromLead({ ...l, in_pipeline: !!l.pipeline_id });
}

/**
 * A mensageria em si (lista + conversa + painel do lead). Usada em dois
 * lugares: dentro do modal flutuante (variant "modal") e na página /chat em
 * tela cheia (variant "page").
 */
export function ChatWorkspace({
  currentUserId,
  userName,
  initialLeadId,
  initialConversations,
  initialThread,
  initialPrefsOpen = false,
  variant = "modal",
  onClose,
}: {
  currentUserId: string;
  userName: string;
  /** Abre direto essa conversa (ex.: ?lead= da página cheia). */
  initialLeadId?: string;
  /** Lista pré-carregada no RSC — evita RPC vazio no mount de /chat. */
  initialConversations?: Conv[];
  /** Thread + contexto pré-carregados quando ?lead= está presente. */
  initialThread?: ChatThreadSeed;
  /** Abre direto nas preferências (?prefs=1 — usado pelo banner de reconexão). */
  initialPrefsOpen?: boolean;
  variant?: "modal" | "page";
  onClose?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const role = useRole();
  const isAdmin = can.manageTeam(role);
  const canDelete = can.deleteLead(role);
  const [accent, setAccent] = useChatAccent();

  // conversa aberta e o que ela carrega
  const [selected, setSelected] = useState<Conv | null>(() =>
    resolveInitialSelected(initialLeadId, initialConversations, initialThread)
  );
  const [msgs, setMsgs] = useState<WhatsappMessage[]>(
    () => initialThread?.messages ?? []
  );
  const [context, setContext] = useState<LeadContext | null>(
    () => initialThread?.context ?? null
  );
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>(
    () => initialThread?.quickReplies ?? []
  );
  const [connected, setConnected] = useState(initialThread?.connected ?? false);
  const [loadingThread, setLoadingThread] = useState(false);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected?.lead_id ?? null;

  const { convs, convsLoaded, loadConvs, typingMap, unreadTotal } =
    useConversations(() => selectedRef.current, initialConversations);

  // telas alternativas da coluna do meio
  const [connOpen, setConnOpen] = useState(initialPrefsOpen);
  const [metricsOpen, setMetricsOpen] = useState(false);
  // popovers do cabeçalho
  const [menuOpen, setMenuOpen] = useState(false);
  const [numMenuOpen, setNumMenuOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const [filters, setFilters] = useState<ConvFilters>({
    search: "",
    sector: "todos",
    owner: "todos",
    number: "todos",
  });
  const patchFilters = (patch: Partial<ConvFilters>) =>
    setFilters((f) => ({ ...f, ...patch }));

  const [chatNumbers, setChatNumbers] = useState<ChatNumber[]>([]);
  const [team, setTeam] = useState<{ id: string; name: string }[]>([]);

  // status REAL da conexão na abertura (antes só chegava ao abrir uma conversa)
  useEffect(() => {
    getConnectionStatus().then((s) => setConnected(s.connected));
    listChatNumbers().then((r) => {
      if ("numbers" in r && r.numbers) setChatNumbers(r.numbers);
    });
  }, []);

  // time (pro filtro por responsável)
  useEffect(() => {
    if (team.length > 0) return;
    supabase
      .from("profiles")
      .select("id, name")
      .eq("active", true)
      .order("name")
      .then(({ data }) => setTeam((data ?? []) as { id: string; name: string }[]));
  }, [team.length, supabase]);

  // popovers (não-modais): Escape fecha, igual ao padrão dos menus do sistema
  useEffect(() => {
    if (!numMenuOpen && !menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setNumMenuOpen(false);
      setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [numMenuOpen, menuOpen]);

  async function loadContext(leadId: string) {
    const r = await fetchDockContext(leadId);
    if ("context" in r) {
      setContext(r.context as unknown as LeadContext);
      setQuickReplies((r.quickReplies ?? []) as QuickReply[]);
      setConnected(!!r.connected);
    }
  }

  async function openThread(c: Conv) {
    setSelected(c);
    setContext(null);
    setLoadingThread(true);
    const [thread] = await Promise.all([
      fetchThread(c.lead_id),
      loadContext(c.lead_id),
    ]);
    setLoadingThread(false);
    if ("messages" in thread) setMsgs(thread.messages as WhatsappMessage[]);
    if (c.unread > 0) markConversationRead(c.lead_id).then(loadConvs);
  }

  // ?lead= na página cheia (ou deep-link): abre a conversa direto
  const initialOpened = useRef(!!initialThread);
  useEffect(() => {
    if (!initialLeadId || initialOpened.current || !convsLoaded) return;
    initialOpened.current = true;
    const conv = convs.find((c) => c.lead_id === initialLeadId);
    if (conv) {
      openThread(conv);
      return;
    }
    // lead sem conversa ainda: monta a partir do contexto
    fetchDockContext(initialLeadId).then((r) => {
      if (!("context" in r)) return;
      const l = (
        r.context as {
          lead: {
            id: string;
            name: string;
            phone: string | null;
            avatar_url: string | null;
            sector: Sector;
            pipeline_id: string | null;
          };
        }
      ).lead;
      openThread(
        convFromLead({ ...l, in_pipeline: !!l.pipeline_id })
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLeadId, convsLoaded]);

  // conversa aberta via seed com não-lidas → marca lida (openThread faria isso)
  useEffect(() => {
    if (!initialThread || !initialLeadId) return;
    const conv = initialConversations?.find((c) => c.lead_id === initialLeadId);
    if (conv && conv.unread > 0) {
      markConversationRead(initialLeadId).then(loadConvs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickLead(l: LeadHit) {
    setNewOpen(false);
    openThread(convFromLead(l));
  }

  async function markAll() {
    if (markingAll) return;
    setMarkingAll(true);
    await markAllConversationsRead();
    setMarkingAll(false);
    loadConvs();
  }

  async function reloadAll() {
    if (reloading) return;
    setReloading(true);
    await loadConvs();
    if (selectedRef.current) {
      const [thread] = await Promise.all([
        fetchThread(selectedRef.current),
        loadContext(selectedRef.current),
      ]);
      if ("messages" in thread) setMsgs(thread.messages as WhatsappMessage[]);
    }
    setReloading(false);
  }

  function closeThread() {
    setSelected(null);
    setContext(null);
    setMsgs([]);
  }

  async function deleteCurrent() {
    const sel = selected;
    if (!sel) return;
    const extra = sel.in_pipeline
      ? "O card no funil será mantido."
      : "O contato também some do chat (está fora do funil).";
    if (
      !confirm(
        `Excluir a conversa com ${sel.name}?\nTodas as mensagens e mídias serão apagadas. ${extra}`
      )
    )
      return;
    const r = await deleteConversation(sel.lead_id);
    if (r && "error" in r && r.error) {
      alert(r.error);
      return;
    }
    closeThread();
    loadConvs();
  }

  /** Painel e lista juntos: setor/valor/tag mudou → o filtro enxerga. */
  async function refreshSelected() {
    if (!selected) return;
    await loadContext(selected.lead_id);
    loadConvs();
  }

  return (
    <div
      className="flex h-full w-full flex-1 overflow-hidden bg-[var(--color-surface)]"
      style={{ "--chat-accent": accent } as React.CSSProperties}
    >
      <ConversationList
        hidden={connOpen}
        collapsed={!!selected}
        header={
          <ListHeader
            connected={connected}
            unreadTotal={unreadTotal}
            userName={userName}
            variant={variant}
            chatNumbers={chatNumbers}
            numFilter={filters.number}
            onNumFilter={(v) => patchFilters({ number: v })}
            numMenuOpen={numMenuOpen}
            onNumMenuOpen={setNumMenuOpen}
            newOpen={newOpen}
            onNewOpen={setNewOpen}
            menuOpen={menuOpen}
            onMenuOpen={setMenuOpen}
            markingAll={markingAll}
            onMarkAll={markAll}
            reloading={reloading}
            onReload={reloadAll}
            onOpenMetrics={() => {
              setMetricsOpen((o) => !o);
              setConnOpen(false);
            }}
            onOpenSettings={() => {
              setConnOpen(true);
              setMetricsOpen(false);
            }}
            selectedLeadId={selected?.lead_id ?? null}
            onClose={onClose}
          />
        }
        newPanel={
          newOpen ? (
            <NewConversation onPick={pickLead} onCreated={loadConvs} />
          ) : null
        }
        filters={filters}
        onFilters={patchFilters}
        chatNumbers={chatNumbers}
        team={team}
        convs={convs}
        typingMap={typingMap}
        selectedId={selected?.lead_id ?? null}
        onOpen={openThread}
        currentUserId={currentUserId}
      />

      {/* coluna do meio: configurações, métricas, conversa ou vazio */}
      <div
        className={`min-w-0 flex-1 flex-col ${
          selected || connOpen || metricsOpen ? "flex" : "hidden sm:flex"
        }`}
      >
        {connOpen ? (
          <ChatSettings
            isAdmin={isAdmin}
            connected={connected}
            accent={accent}
            onAccent={setAccent}
            onClose={() => setConnOpen(false)}
          />
        ) : metricsOpen ? (
          <MetricsPanel
            convs={convs}
            accent={accent}
            onBack={() => setMetricsOpen(false)}
          />
        ) : selected ? (
          <>
            {/* barra mobile: voltar pra lista */}
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-2 py-1.5 sm:hidden">
              <button
                onClick={() => setSelected(null)}
                className="flex min-h-9 min-w-9 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-muted-2)]"
                aria-label="Voltar"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium">{selected.name}</span>
            </div>
            {loadingThread ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted)]" />
              </div>
            ) : (
              <ChatPanel
                key={selected.lead_id}
                lead={{
                  id: selected.lead_id,
                  name: selected.name,
                  phone: selected.phone,
                  avatar_url: selected.avatar_url,
                }}
                messages={msgs}
                connected={connected}
                quickReplies={quickReplies}
                userName={userName}
                currentUserId={currentUserId}
                owner={
                  context
                    ? context.lead.owner
                      ? { id: context.lead.owner.id, name: context.lead.owner.name }
                      : null
                    : undefined
                }
                inPipeline={context ? !!context.lead.pipeline_id : undefined}
                onBack={closeThread}
                onDelete={canDelete ? deleteCurrent : undefined}
                onOwnerChanged={refreshSelected}
                onSync={async () => {
                  const [thread] = await Promise.all([
                    fetchThread(selected.lead_id),
                    loadContext(selected.lead_id),
                  ]);
                  if ("messages" in thread) {
                    setMsgs(thread.messages as WhatsappMessage[]);
                  }
                  loadConvs();
                }}
              />
            )}
          </>
        ) : (
          <EmptyState />
        )}
      </div>

      {/* painel do lead (etapa, transferir, tags, tarefas, notas...) */}
      {selected && context && !loadingThread && (
        <div className="hidden xl:flex">
          <LeadPanel
            context={context}
            currentUserId={currentUserId}
            onChanged={refreshSelected}
          />
        </div>
      )}
    </div>
  );
}
