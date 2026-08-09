"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/ui";

/**
 * Diálogo modal acessível — a peça que faltava no design system.
 *
 * Antes cada tela reimplementava o próprio `fixed inset-0 bg-black/50`, e o
 * comportamento de teclado (foco preso, Escape, foco de volta no botão que
 * abriu) ficava de fora em quase todas. Centralizar aqui é o que torna esse
 * comportamento consistente sem repetir código em cada modal.
 */

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
} as const;

/** Elementos que podem receber foco, ignorando os desabilitados/escondidos. */
const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Título acessível. String vira cabeçalho pronto; node assume o cabeçalho inteiro. */
  title?: React.ReactNode;
  description?: React.ReactNode;
  size?: keyof typeof SIZES;
  children?: React.ReactNode;
  /** Barra de ações fixa no rodapé, fora da área rolável. */
  footer?: React.ReactNode;
  /** Alguns fluxos (envio em andamento) não podem ser cancelados por engano. */
  dismissible?: boolean;
  showClose?: boolean;
  className?: string;
  /** Sem cabeçalho visível, o rótulo do diálogo vem daqui. */
  ariaLabel?: string;
}

/**
 * Toda a mecânica de teclado do modal num lugar só: foco inicial, foco preso,
 * Escape, foco devolvido a quem abriu e trava de rolagem do fundo. Dialog e
 * Drawer dividem isso — a diferença entre os dois é só a caixa.
 */
function useModalBehavior(
  open: boolean,
  onClose: () => void,
  dismissible: boolean
) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const openerRef = React.useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  // Guarda quem abriu para devolver o foco no fechamento — sem isso o usuário
  // de teclado volta pro topo do documento e perde o lugar na página.
  React.useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    return () => {
      const opener = openerRef.current;
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  // Foco inicial: primeiro campo do painel, ou o próprio painel.
  React.useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const first = panel.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel).focus({ preventScroll: true });
  }, [open]);

  // Trava a rolagem do fundo enquanto está aberto.
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape fecha; Tab circula dentro do painel.
  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && dismissible) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose, dismissible]);

  return { panelRef, mounted };
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  size = "lg",
  children,
  footer,
  dismissible = true,
  showClose = true,
  className,
  ariaLabel,
}: DialogProps) {
  const titleId = React.useId();
  const descId = React.useId();
  const { panelRef, mounted } = useModalBehavior(open, onClose, dismissible);

  if (!open || !mounted) return null;

  const hasHeader = title != null;
  const labelledBy = hasHeader ? titleId : undefined;

  return createPortal(
    <div
      className="dock-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : ariaLabel}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "dock-pop card flex max-h-[88vh] w-full flex-col overflow-hidden outline-none",
          SIZES[size],
          className
        )}
        style={{ transformOrigin: "center" }}
      >
        {hasHeader && (
          <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
            <div className="min-w-0">
              {typeof title === "string" ? (
                <h2
                  id={titleId}
                  className="truncate text-base font-semibold text-[var(--color-foreground)]"
                >
                  {title}
                </h2>
              ) : (
                <div id={titleId}>{title}</div>
              )}
              {description && (
                <p
                  id={descId}
                  className="mt-1 text-sm text-[var(--color-muted)]"
                >
                  {description}
                </p>
              )}
            </div>
            {showClose && dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="-mr-1.5 -mt-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-control)] text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </header>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}

const DRAWER_SIZES = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
  "2xl": "sm:max-w-2xl",
} as const;

export interface DrawerProps
  extends Omit<DialogProps, "size" | "footer" | "className"> {
  size?: keyof typeof DRAWER_SIZES;
  footer?: React.ReactNode;
  className?: string;
}

/**
 * Painel deslizante colado na borda direita, altura cheia. Mesma mecânica de
 * teclado do Dialog — a gaveta só troca a caixa. No celular ele ocupa a tela
 * inteira, porque metade de 390px não é painel, é tira.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  size = "lg",
  children,
  footer,
  dismissible = true,
  showClose = true,
  className,
  ariaLabel,
}: DrawerProps) {
  const titleId = React.useId();
  const descId = React.useId();
  const { panelRef, mounted } = useModalBehavior(open, onClose, dismissible);

  if (!open || !mounted) return null;

  const hasHeader = title != null;
  const labelledBy = hasHeader ? titleId : undefined;

  return createPortal(
    <div
      className="dock-backdrop fixed inset-0 z-50 flex justify-end bg-black/40"
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : ariaLabel}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "drawer-in flex h-full w-full flex-col overflow-hidden border-l border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-elevated)] outline-none",
          DRAWER_SIZES[size],
          className
        )}
      >
        {hasHeader && (
          <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
            <div className="min-w-0">
              {typeof title === "string" ? (
                <h2
                  id={titleId}
                  className="truncate text-base font-semibold text-[var(--color-foreground)]"
                >
                  {title}
                </h2>
              ) : (
                <div id={titleId}>{title}</div>
              )}
              {description && (
                <p id={descId} className="mt-1 text-sm text-[var(--color-muted)]">
                  {description}
                </p>
              )}
            </div>
            {showClose && dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="-mr-1.5 -mt-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-control)] text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </header>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}
