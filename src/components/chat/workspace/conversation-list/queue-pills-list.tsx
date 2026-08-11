"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useQueueSessions } from "@/hooks/use-queue-sessions";
import { ConversationRow } from "@/components/chat/workspace/conversation-list/conversation-row";
import { listQueueSessions } from "@/app/(dashboard)/crm/session-actions";
import type { InboxSessionRow, QueueTab } from "@/lib/chat-sessions/types";
import type { Conv } from "@/components/chat/types";

const SESSION_PILLS: { id: QueueTab; label: string }[] = [
  { id: "waiting", label: "Aguardando" },
  { id: "active", label: "Em atendimento" },
  { id: "closed", label: "Encerradas" },
  { id: "mine", label: "Minhas" },
  { id: "all", label: "Todas" },
];

const CRM_PILLS: { id: QueueTab; label: string }[] = [
  { id: "mine", label: "Minhas" },
  { id: "all", label: "Todas" },
];

function sessionToConv(s: InboxSessionRow): Conv {
  return {
    lead_id: s.lead_id,
    name: s.name,
    phone: s.phone,
    sector: s.sector,
    avatar_url: s.avatar_url,
    is_client: false,
    in_pipeline: true,
    owner_id: s.assignee_id,
    owner_name: s.assignee_name,
    last_body: s.last_body,
    last_at: s.last_at,
    last_direction: s.last_direction === "out" ? "out" : "in",
    last_media_type: null,
    number_id: null,
    unread: Number(s.unread) || 0,
  };
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function matchesSearch(
  name: string,
  phone: string | null,
  search: string
): boolean {
  const q = search.trim();
  if (!q) return true;
  if (norm(`${name} ${phone ?? ""}`).includes(norm(q))) return true;
  const digits = q.replace(/\D/g, "");
  return digits.length >= 4 && (phone ?? "").replace(/\D/g, "").includes(digits);
}

/**
 * Pills de fila estilo GronerZap + lista.
 * Com sessions_enabled: Aguardando / Em atendimento / Encerradas / Minhas / Todas.
 * Sem flag: só Minhas / Todas sobre a lista CRM.
 */
export function QueuePillsList({
  sessionsEnabled,
  selectedLeadId,
  currentUserId,
  onOpen,
  countsTick,
  search,
  onSearch,
  crmConvs,
  typingMap,
}: {
  sessionsEnabled: boolean;
  selectedLeadId: string | null;
  currentUserId: string;
  onOpen: (conv: Conv, sessionId?: string) => void;
  countsTick?: number;
  search: string;
  onSearch: (v: string) => void;
  crmConvs: Conv[];
  typingMap: Record<string, boolean>;
}) {
  const [tab, setTab] = useState<QueueTab>(sessionsEnabled ? "waiting" : "all");
  const { sessions, loaded } = useQueueSessions(tab, sessionsEnabled);

  const [counts, setCounts] = useState<Partial<Record<QueueTab, number>>>({});

  useEffect(() => {
    if (!sessionsEnabled) {
      setTab((t) => (t === "mine" || t === "all" ? t : "all"));
      return;
    }
    void (async () => {
      const tabs: QueueTab[] = ["waiting", "active", "closed", "mine", "all"];
      const results = await Promise.all(tabs.map((t) => listQueueSessions(t)));
      const next: Partial<Record<QueueTab, number>> = {};
      tabs.forEach((t, i) => {
        next[t] = results[i].sessions?.length ?? 0;
      });
      setCounts(next);
    })();
  }, [sessionsEnabled, countsTick, sessions.length]);

  const crmVisible = useMemo(() => {
    let list = crmConvs;
    if (tab === "mine") list = list.filter((c) => c.owner_id === currentUserId);
    return list.filter((c) => matchesSearch(c.name, c.phone, search));
  }, [crmConvs, tab, currentUserId, search]);

  const sessionRows = useMemo(
    () => sessions.filter((s) => matchesSearch(s.name, s.phone, search)),
    [sessions, search]
  );

  const pills = sessionsEnabled ? SESSION_PILLS : CRM_PILLS;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-[var(--color-border)] px-3 py-2">
        <label className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-2)]" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Pesquisar conversas"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-muted-2)]"
          />
        </label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {pills.map((p) => {
            const active = tab === p.id;
            const count = sessionsEnabled
              ? counts[p.id]
              : p.id === "mine"
                ? crmConvs.filter((c) => c.owner_id === currentUserId).length
                : crmConvs.length;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setTab(p.id)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
                  active
                    ? "bg-[var(--color-foreground)] text-[var(--color-background)]"
                    : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                }`}
              >
                {p.label}
                {typeof count === "number" ? ` (${count})` : ""}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 divide-y divide-[var(--color-border)]/60 overflow-y-auto">
        {sessionsEnabled ? (
          !loaded ? (
            <p className="px-4 py-8 text-center text-xs text-[var(--color-muted-2)]">
              Carregando…
            </p>
          ) : sessionRows.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-[var(--color-muted)]">
              Nenhuma sessão nesta fila.
            </p>
          ) : (
            sessionRows.map((s) => {
              const conv = sessionToConv(s);
              return (
                <ConversationRow
                  key={s.session_id}
                  conv={conv}
                  active={selectedLeadId === s.lead_id}
                  typing={!!typingMap[s.lead_id]}
                  onOpen={() => onOpen(conv, s.session_id)}
                />
              );
            })
          )
        ) : crmVisible.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-[var(--color-muted)]">
            Nenhuma conversa com esses filtros.
          </p>
        ) : (
          crmVisible.map((c) => (
            <ConversationRow
              key={c.lead_id}
              conv={c}
              active={selectedLeadId === c.lead_id}
              typing={!!typingMap[c.lead_id]}
              onOpen={() => onOpen(c)}
            />
          ))
        )}
      </div>
    </div>
  );
}
