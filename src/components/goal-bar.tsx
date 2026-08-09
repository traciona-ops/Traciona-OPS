"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, Loader2 } from "lucide-react";
import { setMonthlyGoal } from "@/app/(dashboard)/settings/actions";
import { currencyBRL } from "@/lib/utils/ui";

// Barra "quanto falta pra meta" dentro do card Fechado no mês.
// Meta é editável inline por admin/gestor.

export function GoalBar({
  month,
  revenue,
  target,
  canEdit,
}: {
  month: string; // "YYYY-MM"
  revenue: number;
  target: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(target > 0 ? String(target) : "");
  const [busy, setBusy] = useState(false);

  async function save() {
    const t = Number(value.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(t) || t < 0) return;
    setBusy(true);
    await setMonthlyGoal(month, t);
    setBusy(false);
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <div className="mt-2 flex items-center gap-1.5">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="Meta do mês (R$)"
          autoFocus
          className="h-7 w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 text-xs focus:border-[var(--color-primary)] focus:outline-none"
        />
        <button
          onClick={save}
          disabled={busy}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)] text-[var(--color-on-accent)] disabled:opacity-50"
          aria-label="Salvar meta"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    );
  }

  if (target <= 0) {
    if (!canEdit) return null;
    return (
      <button
        onClick={() => setEditing(true)}
        className="mt-2 text-left text-xs text-[var(--color-primary)] hover:underline"
      >
        + Definir meta do mês
      </button>
    );
  }

  const pct = Math.min(100, Math.round((revenue / target) * 100));
  const missing = Math.max(0, target - revenue);

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium" style={{ color: pct >= 100 ? "var(--color-success)" : "var(--color-muted)" }}>
          {pct}% da meta{pct >= 100 ? " — batida!" : ""}
        </span>
        <span className="flex items-center gap-1 text-[var(--color-muted-2)]">
          {pct >= 100 ? "meta batida!" : `faltam ${currencyBRL(missing)}`}
          {canEdit && (
            <button
              onClick={() => setEditing(true)}
              className="text-[var(--color-muted-2)] hover:text-[var(--color-foreground)]"
              aria-label="Editar meta"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-[var(--color-surface-2)]">
        <div
          className="h-1.5 rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: pct >= 100 ? "var(--color-success)" : "var(--color-primary)",
          }}
        />
      </div>
    </div>
  );
}
