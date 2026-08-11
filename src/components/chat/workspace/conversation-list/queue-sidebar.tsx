"use client";

import { useEffect, useState } from "react";
import { useQueueSessions } from "@/hooks/use-queue-sessions";
import { Avatar } from "@/components/ui/avatar";
import { fmtTimeBR } from "@/lib/utils/dates";
import type { InboxSessionRow, QueueTab } from "@/lib/chat-sessions/types";
import type { Conv } from "@/components/chat/types";

const TABS: { id: QueueTab; label: string }[] = [
  { id: "waiting", label: "Aguardando" },
  { id: "active", label: "Em atendimento" },
  { id: "paused", label: "Pausados" },
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

function waitLabel(createdAt: string) {
  const sec = Math.max(
    0,
    Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)
  );
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}min`;
  return `${Math.floor(sec / 3600)}h`;
}

export function QueueSidebar({
  enabled,
  selectedLeadId,
  currentUserId,
  onOpen,
  countsTick,
}: {
  enabled: boolean;
  selectedLeadId: string | null;
  currentUserId: string;
  onOpen: (conv: Conv, sessionId: string) => void;
  countsTick?: number;
}) {
  const [tab, setTab] = useState<QueueTab>("waiting");
  const { sessions, loaded, load } = useQueueSessions(tab, enabled);
  const [counts, setCounts] = useState<Record<QueueTab, number>>({
    waiting: 0,
    active: 0,
    paused: 0,
  });

  useEffect(() => {
    if (!enabled) return;
    void (async () => {
      const { listQueueSessions } = await import(
        "@/app/(dashboard)/crm/session-actions"
      );
      const [w, a, p] = await Promise.all([
        listQueueSessions("waiting"),
        listQueueSessions("active"),
        listQueueSessions("paused"),
      ]);
      setCounts({
        waiting: w.sessions?.length ?? 0,
        active: a.sessions?.length ?? 0,
        paused: p.sessions?.length ?? 0,
      });
    })();
  }, [enabled, countsTick, sessions.length, tab]);

  const filtered =
    tab === "active"
      ? sessions.filter(
          (s) => !s.assignee_id || s.assignee_id === currentUserId
        )
      : sessions;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-0.5 border-b border-[var(--color-border)] px-2 py-1.5">
        {TABS.map((t) => {
          const n = counts[t.id];
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-lg px-1.5 py-1.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
                active
                  ? "bg-[var(--color-surface-2)] text-[var(--color-foreground)]"
                  : "text-[var(--color-muted-2)] hover:bg-[var(--color-surface-2)]/60"
              }`}
            >
              {t.label}
              {n > 0 && (
                <span className="ml-1 tabular-nums text-[var(--color-muted)]">
                  ({n})
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!loaded && (
          <p className="px-4 py-6 text-center text-xs text-[var(--color-muted-2)]">
            Carregando filas…
          </p>
        )}
        {loaded && filtered.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-[var(--color-muted-2)]">
            Nenhuma sessão nesta aba.
          </p>
        )}
        {filtered.map((s) => {
          const selected = s.lead_id === selectedLeadId;
          return (
            <button
              key={s.session_id}
              onClick={() => {
                onOpen(sessionToConv(s), s.session_id);
                void load();
              }}
              className={`flex w-full items-start gap-2.5 border-b border-[var(--color-border)]/60 px-3 py-2.5 text-left transition hover:bg-[var(--color-surface-2)]/80 ${
                selected ? "bg-[var(--color-surface-2)]" : ""
              }`}
            >
              <Avatar name={s.name} src={s.avatar_url} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  <span className="shrink-0 text-[10px] tabular-nums text-[var(--color-muted-2)]">
                    {tab === "waiting"
                      ? waitLabel(s.created_at)
                      : s.last_at
                        ? fmtTimeBR(s.last_at)
                        : ""}
                  </span>
                </div>
                <p className="truncate text-xs text-[var(--color-muted)]">
                  {s.last_body ||
                    (s.routing_reason === "vip_deal"
                      ? "VIP · fila prioritária"
                      : "—")}
                </p>
                {s.assignee_name && tab !== "waiting" && (
                  <p className="mt-0.5 truncate text-[10px] text-[var(--color-muted-2)]">
                    {s.assignee_id === currentUserId
                      ? "Você"
                      : s.assignee_name}
                  </p>
                )}
              </div>
              {s.unread > 0 && (
                <span className="mt-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-primary)] px-1 text-[10px] font-bold text-[var(--color-primary-foreground)]">
                  {s.unread > 99 ? "99+" : s.unread}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
