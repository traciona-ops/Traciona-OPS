"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, Loader2, Trash2 } from "lucide-react";
import {
  updateStage,
  deleteStage,
  moveAllLeads,
} from "@/app/(dashboard)/crm/actions";
import { toast } from "@/components/ui/toast";
import type { PipelineStage } from "@/lib/types";
import { STAGE_COLOR_PALETTE } from "./types";

type StageConfigHeaderProps = {
  stage: PipelineStage;
  allStages: PipelineStage[];
  leadCount: number;
  dragHandleProps: Record<string, unknown>;
};

export function StageConfigHeader({
  stage,
  allStages,
  leadCount,
  dragHandleProps,
}: StageConfigHeaderProps) {
  const router = useRouter();
  const [name, setName] = useState(stage.name);
  const [colorOpen, setColorOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(patch: Parameters<typeof updateStage>[1]) {
    setBusy(true);
    const r = await updateStage(stage.id, patch);
    setBusy(false);
    if (r && "error" in r) toast(r.error, { type: "error" });
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Excluir a etapa "${stage.name}"?`)) return;
    setBusy(true);
    const r = await deleteStage(stage.id);
    setBusy(false);
    if (r && "error" in r) toast(r.error, { type: "error" });
    else router.refresh();
  }

  async function moveAll(toStageId: string) {
    if (!toStageId) return;
    setBusy(true);
    const r = await moveAllLeads(stage.id, toStageId);
    setBusy(false);
    if (r && "error" in r) toast(r.error, { type: "error" });
    else {
      const dest = allStages.find((s) => s.id === toStageId);
      toast(`${leadCount} card(s) movidos para "${dest?.name ?? "etapa"}".`);
      router.refresh();
    }
  }

  // semântica de fechamento da etapa (alimenta relatórios, SLA e o CS)
  const kind = stage.is_won ? "won" : stage.is_lost ? "lost" : "normal";
  const KIND_OPTS = [
    { key: "normal", label: "Normal" },
    { key: "won", label: "Ganho" },
    { key: "lost", label: "Perdido" },
  ] as const;

  return (
    <div className="border-b-2 border-[var(--color-border)] bg-[var(--color-surface)] p-2">
      <div className="flex items-center gap-1">
        <button
          {...dragHandleProps}
          className="cursor-grab touch-none rounded p-0.5 text-[var(--color-muted-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] active:cursor-grabbing"
          aria-label="Arrastar etapa"
          title="Arraste para reordenar"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="relative">
          <button
            onClick={() => setColorOpen((o) => !o)}
            className="h-4 w-4 shrink-0 rounded-full ring-2 ring-white"
            style={{ backgroundColor: stage.color }}
            aria-label="Cor da etapa"
          />
          {colorOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setColorOpen(false)} />
              <div className="absolute left-0 top-6 z-20 grid w-32 grid-cols-5 gap-1 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-2 shadow-xl">
                {STAGE_COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setColorOpen(false);
                      save({ color: c });
                    }}
                    className="h-5 w-5 rounded-full"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== stage.name && name.trim() && save({ name: name.trim() })}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-sm font-medium focus:border-[var(--color-border-strong)] focus:bg-[var(--color-surface-2)] focus:outline-none"
        />
        {busy && <Loader2 className="h-3 w-3 animate-spin text-[var(--color-muted)]" />}
      </div>
      <div className="mt-2 flex items-center gap-1">
        <span
          className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-muted)]"
          title="Identificador (code) — usado em URLs/integrações"
        >
          {stage.code}
        </span>
        <div className="ml-1 flex items-center gap-1 text-[11px] text-[var(--color-muted)]">
          SLA
          <input
            type="number"
            min={0}
            defaultValue={stage.sla_days ?? ""}
            onBlur={(e) => {
              const v = e.target.value.trim();
              const num = v === "" ? null : Math.max(0, Number(v));
              if (num !== (stage.sla_days ?? null)) save({ sla_days: num });
            }}
            placeholder="—"
            className="h-6 w-12 rounded border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-1 text-center text-[11px]"
          />
          dias
        </div>
        <button
          onClick={remove}
          className="ml-auto rounded p-1 text-[var(--color-muted-2)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
          aria-label="Excluir etapa"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Tipo da etapa: Ganho fecha a venda (e promove pro CS); Perdido encerra */}
      <div className="mt-2 flex rounded-lg bg-[var(--color-surface-2)] p-0.5 text-[11px] font-medium">
        {KIND_OPTS.map((o) => (
          <button
            key={o.key}
            onClick={() =>
              o.key !== kind &&
              save({ is_won: o.key === "won", is_lost: o.key === "lost" })
            }
            className={`flex-1 rounded-md py-1 transition ${
              kind === o.key
                ? o.key === "won"
                  ? "bg-[var(--color-success)]/15 text-[var(--color-success)]"
                  : o.key === "lost"
                  ? "bg-[var(--color-danger)]/15 text-[var(--color-danger)]"
                  : "bg-[var(--color-surface)] shadow-sm"
                : "text-[var(--color-muted-2)] hover:text-[var(--color-foreground)]"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {leadCount > 0 && allStages.length > 1 && (
        <select
          value=""
          onChange={(e) => moveAll(e.target.value)}
          className="mt-2 h-7 w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-1.5 text-[11px] text-[var(--color-muted)]"
        >
          <option value="">Mover todos ({leadCount}) para…</option>
          {allStages
            .filter((s) => s.id !== stage.id)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      )}
    </div>
  );
}
