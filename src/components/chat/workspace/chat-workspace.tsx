"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useRole } from "@/components/context/role-context";
import { can } from "@/lib/permissions";
import { useChatAccent } from "@/hooks/use-chat-accent";
import { useConversations } from "@/hooks/use-conversations";
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
import { NumberHeader } from "@/components/chat/workspace/shell/number-header";
import { ChatRail } from "@/components/chat/workspace/shell/chat-rail";
import type { ChatView } from "@/components/chat/workspace/shell/types";
import {
  NewConversation,
  type LeadHit,
} from "@/components/chat/workspace/conversation-list/new-conversation";
import { ChatSettings } from "@/components/chat/workspace/settings/chat-settings";
import { EmptyState } from "@/components/chat/workspace/empty-state";
import { getChatSettings } from "@/app/(dashboard)/crm/whatsapp-actions";
import { MyDashboard } from "@/components/chat/workspace/dashboards/my-dashboard";
import { OpsDashboard } from "@/components/chat/workspace/dashboards/ops-dashboard";
import { QueuesAdmin } from "@/components/chat/workspace/queues/queues-admin";
import type {
  ChatNumber,
  ChatThreadSeed,
  Conv,
  ConvFilters,
  LeadContext,
} from "@/components/chat/types";
import type { QuickReply, Sector, WhatsappMessage } from "@/lib/types";

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
 * Shell OPS Chat (estilo GronerZap): rail + views
 * inbox | minha dash | ops dash | filas | settings.
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
  const role = useRole();
  const isAdmin = can.manageTeam(role);
  const isManager = can.viewReports(role);
  const canDelete = can.deleteLead(role);
  const [accent, setAccent] = useChatAccent();

  const [view, setView] = useState<ChatView>(
    initialPrefsOpen ? "settings" : "inbox"
  );

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

  const [sessionsEnabled, setSessionsEnabled] = useState(false);
  const [queueTick, setQueueTick] = useState(0);
  const [chatNumbers, setChatNumbers] = useState<ChatNumber[]>([]);

  useEffect(() => {
    getConnectionStatus().then((s) => setConnected(s.connected));
    listChatNumbers().then((r) => {
      if ("numbers" in r && r.numbers) setChatNumbers(r.numbers);
    });
    getChatSettings().then((s) => setSessionsEnabled(!!s.sessions_enabled));
  }, []);

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
    setView("inbox");
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
      void openThread(conv);
      return;
    }
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
      void openThread(convFromLead({ ...l, in_pipeline: !!l.pipeline_id }));
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
    void openThread(convFromLead(l));
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
    setQueueTick((t) => t + 1);
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

  async function refreshSelected() {
    if (!selected) return;
    await loadContext(selected.lead_id);
    loadConvs();
  }

  function goView(v: ChatView) {
    setView(v);
    if (v !== "inbox") {
      setNewOpen(false);
      setMenuOpen(false);
      setNumMenuOpen(false);
    } else {
      getChatSettings().then((s) => setSessionsEnabled(!!s.sessions_enabled));
    }
  }

  const numberLabel =
    filters.number === "todos"
      ? chatNumbers.find((n) => n.env_default)?.name ??
        chatNumbers[0]?.name ??
        "Todos"
      : chatNumbers.find((n) => (n.env_default ? "principal" : n.id) === filters.number)
          ?.name ?? "Número";

  const activeNumberId =
    filters.number === "todos" || filters.number === "principal"
      ? null
      : filters.number;

  const showInboxChrome = view === "inbox";

  return (
    <div
      className="flex h-full w-full flex-1 overflow-hidden bg-[var(--color-surface)]"
      style={{ "--chat-accent": accent } as React.CSSProperties}
    >
      <ChatRail
        view={view}
        onView={goView}
        unreadTotal={unreadTotal}
        isManager={isManager}
      />

      {view === "my-dash" && (
        <MyDashboard userName={userName} numberId={activeNumberId} />
      )}
      {view === "ops-dash" && isManager && (
        <OpsDashboard numberLabel={numberLabel} numberId={activeNumberId} />
      )}
      {view === "queues" && isManager && <QueuesAdmin />}
      {view === "settings" && (
        <ChatSettings
          isAdmin={isAdmin}
          connected={connected}
          accent={accent}
          onAccent={setAccent}
          onClose={() => goView("inbox")}
          onOpenQueues={() => goView("queues")}
        />
      )}

      {showInboxChrome && (
        <>
          <ConversationList
            hidden={false}
            collapsed={!!selected}
            header={
              <NumberHeader
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
                onOpenMyDash={() => goView("my-dash")}
                onOpenOpsDash={() => goView("ops-dash")}
                onOpenSettings={() => goView("settings")}
                selectedLeadId={selected?.lead_id ?? null}
                onClose={onClose}
                showOpsDash={isManager}
              />
            }
            newPanel={
              newOpen ? (
                <NewConversation onPick={pickLead} onCreated={loadConvs} />
              ) : null
            }
            filters={filters}
            onFilters={patchFilters}
            convs={
              filters.number === "todos"
                ? convs
                : convs.filter(
                    (c) => (c.number_id ?? "principal") === filters.number
                  )
            }
            typingMap={typingMap}
            selectedId={selected?.lead_id ?? null}
            onOpen={(c) => void openThread(c)}
            currentUserId={currentUserId}
            sessionsEnabled={sessionsEnabled}
            countsTick={queueTick}
          />

          <div
            className={`min-w-0 flex-1 flex-col ${
              selected ? "flex" : "hidden sm:flex"
            }`}
          >
            {selected ? (
              <>
                <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-2 py-1.5 sm:hidden">
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-[var(--color-muted-2)]"
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
                    sessionsEnabled={sessionsEnabled}
                    owner={
                      context
                        ? context.lead.owner
                          ? {
                              id: context.lead.owner.id,
                              name: context.lead.owner.name,
                            }
                          : null
                        : undefined
                    }
                    inPipeline={
                      context ? !!context.lead.pipeline_id : undefined
                    }
                    onBack={closeThread}
                    onDelete={canDelete ? deleteCurrent : undefined}
                    onOwnerChanged={refreshSelected}
                    onSessionChanged={async () => {
                      setQueueTick((t) => t + 1);
                      await refreshSelected();
                    }}
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

          {selected && context && !loadingThread && (
            <div className="hidden xl:flex">
              <LeadPanel
                context={context}
                currentUserId={currentUserId}
                onChanged={refreshSelected}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
