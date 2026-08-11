"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { LeadCard, type BoardLead } from "../lead-card";
import { currencyBRL } from "@/lib/utils/ui";
import type { PipelineStage, Profile } from "@/lib/types";
import { StageConfigHeader } from "./stage-config-header";

type StageColumnProps = {
  stage: PipelineStage;
  allStages: PipelineStage[];
  leads: BoardLead[];
  team: Profile[];
  currentUserId: string;
  configMode: boolean;
  onAdd: () => void;
};

export function StageColumn({
  stage,
  allStages,
  leads,
  team,
  currentUserId,
  configMode,
  onAdd,
}: StageColumnProps) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: stage.id,
    disabled: configMode,
  });
  // Coluna arrastável só no modo Configurar (id prefixado COL_ pra não colidir
  // com o droppable dos leads, que usa stage.id).
  const {
    setNodeRef: setSortRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `COL_${stage.id}`,
    data: { type: "stage" },
    disabled: !configMode,
  });
  const total = leads.reduce((acc, l) => acc + (l.value || 0), 0);

  return (
    <div
      ref={setSortRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex w-[86vw] shrink-0 snap-center flex-col border-r border-t border-[var(--color-border)] first:border-l md:w-[300px] md:snap-align-none ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      {configMode ? (
        <StageConfigHeader
          stage={stage}
          allStages={allStages}
          leadCount={leads.length}
          dragHandleProps={{ ...attributes, ...listeners }}
        />
      ) : (
        <div className="border-b-2 border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5">
          <p className="truncate text-[13px] font-bold">{stage.name}</p>
          <p className="mt-0.5 text-[11px] tabular-nums text-[var(--color-muted)]">
            {currencyBRL(total)} · {leads.length} negócio
            {leads.length === 1 ? "" : "s"}
          </p>
        </div>
      )}

      <div
        ref={setDropRef}
        className={`flex-1 space-y-2 overflow-y-auto p-2.5 transition-colors ${
          isOver
            ? "bg-[var(--color-primary)]/8"
            : "bg-[var(--color-surface-2)]/50"
        }`}
      >
        <SortableContext
          items={leads.map((l) => l.id)}
          strategy={verticalListSortingStrategy}
        >
          {leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              stage={stage}
              team={team}
              currentUserId={currentUserId}
              dragDisabled={configMode}
            />
          ))}
        </SortableContext>

        {leads.length === 0 && !configMode && (
          <div className="rounded-xl border border-dashed border-[var(--color-border-strong)] py-7 text-center text-xs leading-relaxed text-[var(--color-muted-2)]">
            Nenhum negócio
            <br />
            Arraste um card pra cá
          </div>
        )}

        {!configMode && (
          <button
            onClick={onAdd}
            title="Adicionar negócio"
            aria-label="Adicionar negócio"
            className="flex h-8 w-full items-center justify-center rounded-lg border border-dashed border-[var(--color-border-strong)] text-[var(--color-muted-2)] transition hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 hover:text-[var(--color-primary)]"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
