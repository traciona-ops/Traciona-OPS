"use client";

import { Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PRESETS = [
  { label: "Em 1h", get: () => new Date(Date.now() + 3600_000) },
  {
    label: "Hoje 18h",
    get: () => {
      const d = new Date();
      d.setHours(18, 0, 0, 0);
      return d;
    },
  },
  {
    label: "Amanhã 9h",
    get: () => {
      const d = new Date(Date.now() + 86400_000);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
] as const;

/** datetime-local NÃO pode sair de toISOString() — isso joga o horário pra UTC. */
function toLocalValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/** Agendar o envio da mensagem que está na caixa (popover do relógio). */
export function SchedulePopover({
  open,
  onToggle,
  disabled,
  when,
  onWhen,
  hasText,
  scheduling,
  onSchedule,
}: {
  open: boolean;
  onToggle: () => void;
  disabled: boolean;
  when: string;
  onWhen: (v: string) => void;
  hasText: boolean;
  scheduling: boolean;
  onSchedule: () => void;
}) {
  return (
    <div className="relative hidden sm:block">
      <button
        onClick={onToggle}
        disabled={disabled}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border-strong)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        aria-label="Agendar envio"
        title="Agendar mensagem (enviar depois)"
      >
        <Clock className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute bottom-12 left-0 z-30 w-64 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-lg">
          <p className="mb-2 flex items-center gap-1 text-xs font-medium text-[var(--color-muted)]">
            <Clock className="h-3.5 w-3.5" /> Agendar para
          </p>
          <div className="mb-2 flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => onWhen(toLocalValue(p.get()))}
                className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-muted)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              >
                {p.label}
              </button>
            ))}
          </div>
          <Input
            type="datetime-local"
            value={when}
            onChange={(e) => onWhen(e.target.value)}
            className="mb-2 h-9 text-xs"
          />
          {!hasText && (
            <p className="mb-2 text-[11px] text-[var(--color-muted-2)]">
              Digite a mensagem na caixa antes de agendar.
            </p>
          )}
          <Button
            size="sm"
            className="w-full"
            disabled={scheduling || !when || !hasText}
            onClick={onSchedule}
          >
            {scheduling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Agendar mensagem"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
