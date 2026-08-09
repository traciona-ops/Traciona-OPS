"use client";

import { useEffect, useState } from "react";
import {
  Phone,
  MessageCircle,
  Mail,
  CalendarDays,
  Repeat,
  MapPin,
  ListChecks,
  ChevronDown,
  Check,
  type LucideIcon,
} from "lucide-react";
import { type TaskCategory } from "@/lib/types";
import { TASK_CATEGORY } from "@/lib/data/labels";

export const TASK_TYPE_ICON: Record<TaskCategory, LucideIcon> = {
  ligacao: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  reuniao: CalendarDays,
  followup: Repeat,
  visita: MapPin,
  tarefa: ListChecks,
};

export const TASK_TYPES = Object.keys(TASK_CATEGORY) as TaskCategory[];
export const DEFAULT_TASK_TYPE: TaskCategory = "ligacao";

/** Badge do tipo de tarefa (ícone + label). Ignora valores desconhecidos. */
export function TaskTypeBadge({ value }: { value?: string | null }) {
  if (!value || !(value in TASK_CATEGORY)) return null;
  const k = value as TaskCategory;
  const { label, color } = TASK_CATEGORY[k];
  const Icon = TASK_TYPE_ICON[k];
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: `${color}22`, color }}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

/**
 * Seletor do tipo de tarefa (dropdown custom com ÍCONES em cada opção —
 * o <select> nativo não renderiza ícone). `className` controla o layout
 * do wrapper (largura/altura/flex).
 */
export function TaskTypeSelect({
  value,
  onChange,
  className = "h-10 w-full",
}: {
  value: TaskCategory;
  onChange: (v: TaskCategory) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const sel = TASK_CATEGORY[value];
  const SelIcon = TASK_TYPE_ICON[value];

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex h-full w-full items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
      >
        <SelIcon className="h-3.5 w-3.5 shrink-0" style={{ color: sel.color }} />
        <span className="truncate">{sel.label}</span>
        <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+4px)] z-30 w-44 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-1 shadow-xl">
            {TASK_TYPES.map((k) => {
              const Icon = TASK_TYPE_ICON[k];
              const c = TASK_CATEGORY[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    onChange(k);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: c.color }} />
                  <span className="flex-1">{c.label}</span>
                  {k === value && (
                    <Check className="h-3.5 w-3.5 text-[var(--color-primary)]" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
