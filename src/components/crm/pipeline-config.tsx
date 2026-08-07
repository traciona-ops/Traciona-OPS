"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2, Check, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { readableInk } from "@/lib/utils";
import { updatePipeline, deletePipeline } from "@/app/(dashboard)/crm/actions";
import type { Pipeline } from "@/lib/types";

const PALETTE = [
  "#1d6fff", "#00d4ff", "#00e5a0", "#fbbf24",
  "#f59e0b", "#ff5c5c", "#f472b6", "#a78bfa", "#8b9bb4",
];

/** Modal de edição de um funil (renomear, cor, excluir). */
export function PipelineModal({
  pipeline,
  leadCount = 0,
  stageCount = 0,
  startDeleting = false,
  onClose,
}: {
  pipeline: Pipeline;
  leadCount?: number;
  stageCount?: number;
  startDeleting?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(pipeline.name);
  const [color, setColor] = useState(pipeline.color);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(startDeleting && leadCount === 0);
  const [error, setError] = useState<string | null>(null);

  const dirty = name.trim() !== pipeline.name || color !== pipeline.color;

  async function save() {
    if (!name.trim() || !dirty) return;
    setBusy(true);
    setError(null);
    const r = await updatePipeline(pipeline.id, { name: name.trim(), color });
    setBusy(false);
    if (r && "error" in r) {
      setError(r.error);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    router.refresh();
  }

  async function pickColor(c: string) {
    setColor(c);
    setBusy(true);
    await updatePipeline(pipeline.id, { color: c });
    setBusy(false);
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const r = await deletePipeline(pipeline.id);
    setBusy(false);
    if (r && "error" in r) {
      setError(r.error);
      setConfirmDel(false);
      return;
    }
    onClose();
    router.push("/crm");
    router.refresh();
  }

  return (
    <Dialog open onClose={onClose} title="Editar funil" size="md" dismissible={!busy}>
      {error && (
        <p className="mb-3 rounded-lg bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <label htmlFor="pipeline-name" className="mb-1 block text-xs text-[var(--color-muted)]">
        Nome do funil
      </label>
      <div className="flex gap-2">
        <Input
          id="pipeline-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          autoFocus
        />
        <Button size="sm" onClick={save} disabled={!dirty || busy || !name.trim()}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="h-4 w-4" />
          ) : (
            "Salvar"
          )}
        </Button>
      </div>

      <span className="mb-1.5 mt-4 block text-xs text-[var(--color-muted)]">
        Cor
      </span>
      <div className="flex flex-wrap gap-2">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => pickColor(c)}
            className="flex h-7 w-7 items-center justify-center rounded-full transition hover:scale-110"
            style={{
              backgroundColor: c,
              ...(color === c
                ? { boxShadow: "0 0 0 2px var(--color-surface), 0 0 0 4px " + c }
                : {}),
            }}
            aria-label={`Cor ${c}`}
          >
            {color === c && (
              <Check className="h-3.5 w-3.5" style={{ color: readableInk(c) }} />
            )}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3 text-[11px] text-[var(--color-muted-2)]">
        <span>
          Código: <span className="font-mono">{pipeline.code}</span>
        </span>
        <span>·</span>
        <span>{stageCount} etapa(s)</span>
        <span>·</span>
        <span>{leadCount} lead(s)</span>
      </div>

      <div className="mt-4 rounded-lg border border-[var(--color-danger)]/25 p-3">
        {!confirmDel ? (
          <button
            type="button"
            onClick={() => setConfirmDel(true)}
            disabled={leadCount > 0}
            className="flex items-center gap-2 text-sm text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-50"
            title={leadCount > 0 ? "Mova os leads antes de excluir" : "Excluir funil"}
          >
            <Trash2 className="h-4 w-4" />
            Excluir este funil
          </button>
        ) : (
          <div>
            <p className="flex items-start gap-2 text-xs text-[var(--color-foreground)]">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-danger)]" />
              Excluir <b>&ldquo;{pipeline.name}&rdquo;</b> e suas {stageCount}{" "}
              etapa(s)? Não dá pra desfazer.
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmDel(false)}>
                Voltar
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={remove}
                disabled={busy}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sim, excluir"}
              </Button>
            </div>
          </div>
        )}
        {leadCount > 0 && !confirmDel && (
          <p className="mt-1.5 text-[11px] text-[var(--color-muted-2)]">
            Este funil tem {leadCount} lead(s). Mova-os para outro funil antes
            de excluir.
          </p>
        )}
      </div>
    </Dialog>
  );
}
