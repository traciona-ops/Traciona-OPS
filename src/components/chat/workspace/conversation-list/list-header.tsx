"use client";

import {
  ArrowLeftRight,
  BarChart3,
  Check,
  CheckCheck,
  ExternalLink,
  Loader2,
  MoreVertical,
  RefreshCw,
  Settings2,
  SquarePen,
  X,
} from "lucide-react";
import type { ChatNumber } from "@/components/chat/types";

/**
 * Topo da lista: marca + status da conexão, troca de número, nova conversa e
 * o menu ⋮ (métricas, marcar todas, abrir como app, recarregar, configurações).
 */
export function ListHeader({
  connected,
  unreadTotal,
  userName,
  variant,
  chatNumbers,
  numFilter,
  onNumFilter,
  numMenuOpen,
  onNumMenuOpen,
  newOpen,
  onNewOpen,
  menuOpen,
  onMenuOpen,
  markingAll,
  onMarkAll,
  reloading,
  onReload,
  onOpenMetrics,
  onOpenSettings,
  selectedLeadId,
  onClose,
}: {
  connected: boolean;
  unreadTotal: number;
  userName: string;
  variant: "modal" | "page";
  chatNumbers: ChatNumber[];
  numFilter: string;
  onNumFilter: (v: string) => void;
  numMenuOpen: boolean;
  onNumMenuOpen: (v: boolean) => void;
  newOpen: boolean;
  onNewOpen: (v: boolean) => void;
  menuOpen: boolean;
  onMenuOpen: (v: boolean) => void;
  markingAll: boolean;
  onMarkAll: () => void;
  reloading: boolean;
  onReload: () => void;
  onOpenMetrics: () => void;
  onOpenSettings: () => void;
  selectedLeadId: string | null;
  onClose?: () => void;
}) {
  const iconBtn =
    "flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]";
  const menuItem =
    "flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-left text-sm transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]";

  const numLabel =
    numFilter !== "todos"
      ? `${
          chatNumbers.find((n) => (n.env_default ? "principal" : n.id) === numFilter)
            ?.name ?? "Número"
        } · `
      : "";

  return (
    <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
      <div className="flex items-center gap-2.5">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] bg-[var(--chat-accent)]/12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/symbol.svg" alt="OPS Chat" className="h-[22px] w-[22px]" />
          <span
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-surface)]"
            style={{
              backgroundColor: connected
                ? "var(--color-success)"
                : "var(--color-danger)",
            }}
            title={connected ? "WhatsApp conectado" : "WhatsApp desconectado"}
          />
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight">OPS Chat</p>
          <p className="text-[11px] leading-tight text-[var(--color-muted-2)]">
            {numLabel}
            {unreadTotal > 0
              ? `${unreadTotal} não lida${unreadTotal > 1 ? "s" : ""}`
              : "tudo em dia"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {/* trocar número (sempre visível, estilo Groner) */}
        {chatNumbers.length > 0 && (
          <div className="relative">
            <button
              onClick={() => onNumMenuOpen(!numMenuOpen)}
              title="Trocar número"
              aria-label="Trocar número"
              aria-haspopup="menu"
              aria-expanded={numMenuOpen}
              className={`${iconBtn} ${
                numFilter !== "todos"
                  ? "bg-[var(--chat-accent)]/12 text-[var(--chat-accent)]"
                  : "text-[var(--color-muted-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--chat-accent)]"
              }`}
            >
              <ArrowLeftRight className="h-[18px] w-[18px]" />
            </button>
            {numMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => onNumMenuOpen(false)}
                />
                <div className="absolute left-0 top-11 z-20 w-52 rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-1 shadow-xl">
                  <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-2)]">
                    Trocar número
                  </p>
                  {[
                    { value: "todos", label: "Todos os números" },
                    ...chatNumbers.map((n) => ({
                      value: n.env_default ? "principal" : n.id,
                      label: n.name,
                    })),
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        onNumFilter(opt.value);
                        onNumMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-[var(--radius-control)] px-2.5 py-2 text-left text-sm transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                    >
                      <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                      {numFilter === opt.value && (
                        <Check className="h-4 w-4 shrink-0 text-[var(--chat-accent)]" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ação principal sempre à mão */}
        <button
          onClick={() => onNewOpen(!newOpen)}
          className={`${iconBtn} ${
            newOpen
              ? "bg-[var(--chat-accent)]/12 text-[var(--chat-accent)]"
              : "text-[var(--color-muted-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--chat-accent)]"
          }`}
          title="Nova conversa"
          aria-label="Nova conversa"
          aria-expanded={newOpen}
        >
          <SquarePen className="h-[18px] w-[18px]" />
        </button>

        {/* o resto vive no menu ⋮ (padrão WhatsApp) */}
        <div className="relative">
          <button
            onClick={() => onMenuOpen(!menuOpen)}
            className={`${iconBtn} ${
              menuOpen
                ? "bg-[var(--color-surface-2)] text-[var(--color-foreground)]"
                : "text-[var(--color-muted-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
            }`}
            title="Mais opções"
            aria-label="Mais opções"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <MoreVertical className="h-[18px] w-[18px]" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => onMenuOpen(false)} />
              <div className="absolute right-0 top-11 z-20 w-60 rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-1.5 shadow-xl">
                <button
                  onClick={() => {
                    onMenuOpen(false);
                    onOpenMetrics();
                  }}
                  className={menuItem}
                >
                  <BarChart3 className="h-4 w-4 text-[var(--color-muted)]" />
                  Métricas das conversas
                </button>
                <button
                  onClick={() => {
                    onMenuOpen(false);
                    onMarkAll();
                  }}
                  disabled={markingAll || unreadTotal === 0}
                  className={`${menuItem} disabled:opacity-40`}
                >
                  {markingAll ? (
                    <Loader2 className="h-4 w-4 animate-spin text-[var(--color-muted)]" />
                  ) : (
                    <CheckCheck className="h-4 w-4 text-[var(--color-muted)]" />
                  )}
                  Marcar todas como lidas
                  {unreadTotal > 0 && (
                    <span className="ml-auto rounded-full bg-[var(--chat-accent)]/12 px-1.5 text-[11px] font-semibold text-[var(--chat-accent)]">
                      {unreadTotal > 99 ? "99+" : unreadTotal}
                    </span>
                  )}
                </button>
                {variant === "modal" && (
                  <a
                    href={`/chat${selectedLeadId ? `?lead=${selectedLeadId}` : ""}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => {
                      onMenuOpen(false);
                      onClose?.();
                    }}
                    className={menuItem}
                  >
                    <ExternalLink className="h-4 w-4 text-[var(--color-muted)]" />
                    Abrir como app
                  </a>
                )}
                <button
                  onClick={() => {
                    onMenuOpen(false);
                    onReload();
                  }}
                  className={menuItem}
                >
                  <RefreshCw
                    className={`h-4 w-4 text-[var(--color-muted)] ${
                      reloading ? "animate-spin" : ""
                    }`}
                  />
                  Recarregar chat
                </button>
                <div className="my-1 h-px bg-[var(--color-border)]" />
                <button
                  onClick={() => {
                    onMenuOpen(false);
                    onOpenSettings();
                  }}
                  className={menuItem}
                >
                  <Settings2 className="h-4 w-4 text-[var(--color-muted)]" />
                  Configurações
                </button>
                <p className="px-2.5 pb-1 pt-1.5 text-[11px] text-[var(--color-muted-2)]">
                  Conectado como {userName.split(" ")[0]}
                </p>
              </div>
            </>
          )}
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className={`${iconBtn} text-[var(--color-muted-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]`}
            aria-label="Fechar"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>
    </div>
  );
}
