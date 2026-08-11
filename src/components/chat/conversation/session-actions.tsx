"use client";

import { useState } from "react";
import { Headset, Loader2, Pause, Play, XCircle } from "lucide-react";
import {
  claimChatSession,
  pauseChatSession,
  resumeChatSession,
  closeChatSession,
} from "@/app/(dashboard)/crm/session-actions";
import type { ActiveSession } from "@/hooks/use-active-session";

/** Ações do ticket no header: Assumir / Pausar / Retomar / Encerrar. */
export function SessionActions({
  session,
  currentUserId,
  onChanged,
}: {
  session: ActiveSession;
  currentUserId?: string;
  onChanged?: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<{ error?: string } | { ok: true }>) {
    if (busy) return;
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (r && "error" in r && r.error) {
      alert(r.error);
      return;
    }
    await onChanged?.();
  }

  const btn =
    "flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] sm:px-3";

  if (session.status === "waiting") {
    return (
      <button
        onClick={() => run("claim", () => claimChatSession(session.id))}
        disabled={!!busy || !currentUserId}
        className={`${btn} bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary-hover)]`}
        title="Assumir conversa"
        aria-label="Assumir conversa"
      >
        {busy === "claim" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Headset className="h-3.5 w-3.5" />
        )}
        <span className="hidden sm:inline">Assumir conversa</span>
        <span className="sm:hidden">Assumir</span>
      </button>
    );
  }

  const mine = session.assignee_id === currentUserId;

  if (session.status === "active" && mine) {
    return (
      <div className="mr-1 flex items-center gap-1">
        <button
          onClick={() => run("pause", () => pauseChatSession(session.id))}
          disabled={!!busy}
          className={`${btn} border border-[var(--color-border-strong)] text-[var(--color-foreground)] hover:bg-[var(--color-surface-2)]`}
          title="Pausar atendimento"
          aria-label="Pausar atendimento"
        >
          {busy === "pause" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Pause className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">Pausar</span>
        </button>
        <button
          onClick={() => {
            if (!confirm("Encerrar este atendimento?")) return;
            return run("close", () => closeChatSession(session.id));
          }}
          disabled={!!busy}
          className={`${btn} border border-[var(--color-danger)]/40 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10`}
          title="Encerrar atendimento"
          aria-label="Encerrar atendimento"
        >
          {busy === "close" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <XCircle className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">Encerrar</span>
        </button>
      </div>
    );
  }

  if (session.status === "paused" && mine) {
    return (
      <div className="mr-1 flex items-center gap-1">
        <button
          onClick={() => run("resume", () => resumeChatSession(session.id))}
          disabled={!!busy}
          className={`${btn} bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary-hover)]`}
          title="Retomar atendimento"
          aria-label="Retomar atendimento"
        >
          {busy === "resume" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">Retomar</span>
        </button>
        <button
          onClick={() => {
            if (!confirm("Encerrar este atendimento?")) return;
            return run("close", () => closeChatSession(session.id));
          }}
          disabled={!!busy}
          className={`${btn} border border-[var(--color-danger)]/40 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10`}
          title="Encerrar atendimento"
          aria-label="Encerrar atendimento"
        >
          {busy === "close" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <XCircle className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">Encerrar</span>
        </button>
      </div>
    );
  }

  return null;
}
