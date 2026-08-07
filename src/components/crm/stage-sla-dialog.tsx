"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { updateStageSla } from "@/app/(dashboard)/crm/actions";
import type { PipelineStage } from "@/lib/types";

export function StageSlaDialog({
  stages,
  onClose,
}: {
  stages: PipelineStage[];
  onClose: () => void;
}) {
  const router = useRouter();
  const editable = stages.filter((s) => !s.is_won && !s.is_lost);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const s of editable) v[s.id] = s.sla_days != null ? String(s.sla_days) : "";
    return v;
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await Promise.all(
      editable.map((s) => {
        const raw = values[s.id]?.trim();
        const num = raw === "" || raw == null ? null : Math.max(0, Number(raw));
        const current = s.sla_days ?? null;
        if (num === current) return Promise.resolve();
        return updateStageSla(s.id, num);
      })
    );
    setSaving(false);
    router.refresh();
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2 text-base font-semibold text-[var(--color-foreground)]">
          <Timer className="h-4 w-4 text-[var(--color-primary)]" />
          Prazos das etapas
        </span>
      }
      description={
        <>
          Defina quantos dias um lead pode ficar parado em cada etapa. Ao
          estourar, o card fica{" "}
          <span className="text-[var(--color-danger)]">Atrasado</span>.
          Deixe em branco para não cobrar prazo.
        </>
      }
      size="md"
      dismissible={!saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar prazos
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {editable.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-3 rounded-lg bg-[var(--color-surface-2)] px-3 py-2"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <label htmlFor={`sla-${s.id}`} className="flex-1 truncate text-sm">
              {s.name}
            </label>
            <Input
              id={`sla-${s.id}`}
              type="number"
              min={0}
              value={values[s.id]}
              onChange={(e) =>
                setValues((v) => ({ ...v, [s.id]: e.target.value }))
              }
              placeholder="—"
              className="h-9 w-20 text-center text-sm"
            />
            <span className="w-8 text-xs text-[var(--color-muted)]">dias</span>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
