"use client";

import {
  ArrowLeftRight,
  Check,
  CheckCheck,
  ExternalLink,
  Loader2,
  MoreVertical,
  RefreshCw,
  Settings2,
  SquarePen,
  UserRound,
  LayoutGrid,
  X,
} from "lucide-react";
import type { ChatNumber } from "@/components/chat/types";

/**
 * Barra escura do número ativo (estilo GronerZap):
 * nome + telefone à esquerda; trocar número, nova conversa e ⋮ à direita.
 */
export function NumberHeader({
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
  onOpenMyDash,
  onOpenOpsDash,
  onOpenSettings,
  selectedLeadId,
  onClose,
  showOpsDash,
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
  onOpenMyDash: () => void;
  onOpenOpsDash: () => void;
  onOpenSettings: () => void;
  selectedLeadId: string | null;
  onClose?: () => void;
  showOpsDash: boolean;
}) {
  const active =
    numFilter === "todos"
      ? chatNumbers.find((n) => n.env_default) ?? chatNumbers[0]
      : chatNumbers.find((n) => (n.env_default ? "principal" : n.id) === numFilter);

  const title = active?.name ?? "OPS Chat";
  const phoneHint =
    numFilter === "todos" && chatNumbers.length > 1
      ? "Todos os números"
      : connected
        ? "Conectado"
        : "Desconectado";

  const iconBtn =
    "flex h-9 w-9 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40";
  const menuItem =
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]";

  return (
    <div className="flex items-center justify-between bg-[var(--color-foreground)] px-3 py-2.5 text-[var(--color-background)]">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--chat-accent)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/symbol.svg" alt="" className="h-5 w-5 brightness-0 invert" />
          <span
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-foreground)]"
            style={{
              backgroundColor: connected
                ? "var(--color-success)"
                : "var(--color-danger)",
            }}
            title={connected ? "WhatsApp conectado" : "WhatsApp desconectado"}
          />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight text-white">
            {title}
          </p>
          <p className="truncate text-[11px] leading-tight text-white/65">
            {phoneHint}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {chatNumbers.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => onNumMenuOpen(!numMenuOpen)}
              title="Trocar número"
              aria-label="Trocar número"
              aria-haspopup="menu"
              aria-expanded={numMenuOpen}
              className={`${iconBtn} ${
                numFilter !== "todos" ? "bg-white/15 text-white" : ""
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
                      type="button"
                      onClick={() => {
                        onNumFilter(opt.value);
                        onNumMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-2)]"
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

        <button
          type="button"
          onClick={() => onNewOpen(!newOpen)}
          className={`${iconBtn} ${newOpen ? "bg-white/15 text-white" : ""}`}
          title="Nova conversa"
          aria-label="Nova conversa"
          aria-expanded={newOpen}
        >
          <SquarePen className="h-[18px] w-[18px]" />
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => onMenuOpen(!menuOpen)}
            className={`${iconBtn} ${menuOpen ? "bg-white/15 text-white" : ""}`}
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
                  type="button"
                  onClick={() => {
                    onMenuOpen(false);
                    onOpenMyDash();
                  }}
                  className={menuItem}
                >
                  <UserRound className="h-4 w-4 text-[var(--color-muted)]" />
                  Minha dashboard
                </button>
                {showOpsDash && (
                  <button
                    type="button"
                    onClick={() => {
                      onMenuOpen(false);
                      onOpenOpsDash();
                    }}
                    className={menuItem}
                  >
                    <LayoutGrid className="h-4 w-4 text-[var(--color-muted)]" />
                    Dashboard de atendimentos
                  </button>
                )}
                <button
                  type="button"
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
                  type="button"
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
                  type="button"
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
            type="button"
            onClick={onClose}
            className={iconBtn}
            aria-label="Fechar"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>
    </div>
  );
}
