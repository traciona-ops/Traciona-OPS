"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Check,
  MoreVertical,
  Pencil,
  Trash2,
  Plus,
  Loader2,
  Zap,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { createPipeline } from "@/app/(dashboard)/crm/actions";
import { PipelineModal } from "./pipeline-config";
import { AutomationsModal } from "./automations-modal";
import type { Pipeline } from "@/lib/types";

export function PipelineSelect({
  pipelines,
  active,
  canConfig = false,
  leadCounts = {},
  stageCounts = {},
}: {
  pipelines: Pipeline[];
  active: Pipeline;
  canConfig?: boolean;
  leadCounts?: Record<string, number>;
  stageCounts?: Record<string, number>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    pipeline: Pipeline;
    del: boolean;
  } | null>(null);
  const [automating, setAutomating] = useState<Pipeline | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!newName.trim()) return;
    setBusy(true);
    const r = await createPipeline(newName.trim());
    setBusy(false);
    setNewName("");
    setCreating(false);
    setOpen(false);
    if (r && "id" in r && r.id) router.push(`/crm?p=${r.id}`);
    else router.refresh();
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setMenuFor(null);
        setCreating(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border-strong)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
      >
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: active.color }}
        />
        {active.name}
        <ChevronDown className="h-3.5 w-3.5 text-[var(--color-muted)]" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => {
              setOpen(false);
              setMenuFor(null);
              setCreating(false);
            }}
          />
          <div className="absolute left-0 top-10 z-20 w-64 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-1 shadow-xl">
            {pipelines.map((p) => (
              <div key={p.id} className="group relative">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (p.id !== active.id) router.push(`/crm?p=${p.id}`);
                  }}
                  className="flex w-full items-center gap-2 rounded-md py-2 pl-2 pr-9 text-left text-sm hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="flex-1 truncate">{p.name}</span>
                  {p.id === active.id && (
                    <Check className="h-3.5 w-3.5 text-[var(--color-primary)]" />
                  )}
                </button>

                {canConfig && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuFor((m) => (m === p.id ? null : p.id));
                    }}
                    className="absolute right-1 top-1/2 grid min-h-9 min-w-9 -translate-y-1/2 place-items-center rounded text-[var(--color-muted-2)] opacity-0 hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] group-hover:opacity-100 data-[on=true]:opacity-100"
                    data-on={menuFor === p.id}
                    aria-haspopup="listbox"
                    aria-expanded={menuFor === p.id}
                    aria-label="Opções do funil"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                )}

                {menuFor === p.id && (
                  <div className="absolute right-1 top-9 z-30 w-36 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-1 shadow-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuFor(null);
                        setOpen(false);
                        setEditing({ pipeline: p, del: false });
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                    >
                      <Pencil className="h-3.5 w-3.5 text-[var(--color-muted)]" />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuFor(null);
                        setOpen(false);
                        setAutomating(p);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                    >
                      <Zap className="h-3.5 w-3.5 text-[var(--color-muted)]" />
                      Automações
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuFor(null);
                        setOpen(false);
                        setEditing({ pipeline: p, del: true });
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger)]/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Excluir
                    </button>
                  </div>
                )}
              </div>
            ))}

            {canConfig && (
              <>
                <div className="my-1 h-px bg-[var(--color-border)]" />
                {creating ? (
                  <div className="flex gap-1.5 p-1">
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && create()}
                      placeholder="Nome do funil"
                      className="h-9 text-sm"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={create}
                      disabled={!newName.trim() || busy}
                      className="grid h-9 min-w-9 shrink-0 place-items-center rounded-lg bg-[var(--color-primary)] px-2 text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] disabled:opacity-50"
                      aria-label="Criar funil"
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCreating(true)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[var(--color-primary)] hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                  >
                    <Plus className="h-4 w-4" />
                    Criar funil
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}

      {editing && (
        <PipelineModal
          pipeline={editing.pipeline}
          leadCount={leadCounts[editing.pipeline.id] ?? 0}
          stageCount={stageCounts[editing.pipeline.id] ?? 0}
          startDeleting={editing.del}
          onClose={() => setEditing(null)}
        />
      )}

      {automating && (
        <AutomationsModal
          pipeline={automating}
          onClose={() => setAutomating(null)}
        />
      )}
    </div>
  );
}
