"use client";

import {
  DndContext,
  DragOverlay,
  closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus, GripVertical } from "lucide-react";
import { LeadCard } from "./lead-card";
import { NewLeadDialog } from "./new-lead-dialog";
import { StageSlaDialog } from "./stage-sla-dialog";
import { FilterBar } from "./filter-bar";
import { useRole } from "@/components/context/role-context";
import { can } from "@/lib/permissions";
import { KanbanHeader } from "./kanban/kanban-header";
import { StageColumn } from "./kanban/stage-column";
import { useKanbanBoard } from "./kanban/use-kanban-board";
import { leadMatches } from "./kanban/lead-matches";
import type { KanbanBoardProps } from "./kanban/types";

export function KanbanBoard({
  pipeline,
  pipelines,
  stages,
  initialLeads,
  team,
  currentUserId,
  pipelineLeadCounts,
  pipelineStageCounts,
  stats,
}: KanbanBoardProps) {
  const role = useRole();
  const canConfig = can.configurePipelines(role);

  const {
    items,
    sensors,
    activeLead,
    activeStage,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    newLeadStage,
    setNewLeadStage,
    slaOpen,
    setSlaOpen,
    configMode,
    setConfigMode,
    busy,
    filterOpen,
    setFilterOpen,
    filter,
    setFilter,
    addStage,
    firstOpenStage,
    filterCount,
  } = useKanbanBoard(pipeline, stages, initialLeads);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <KanbanHeader
        pipeline={pipeline}
        pipelines={pipelines}
        stages={stages}
        canConfig={canConfig}
        configMode={configMode}
        onConfigModeChange={setConfigMode}
        busy={busy}
        filterOpen={filterOpen}
        filterCount={filterCount}
        onFilterToggle={() => setFilterOpen((o) => !o)}
        onSlaOpen={() => setSlaOpen(true)}
        onAddStage={addStage}
        onNewLead={() => firstOpenStage && setNewLeadStage(firstOpenStage.id)}
        firstOpenStage={firstOpenStage}
        pipelineLeadCounts={pipelineLeadCounts}
        pipelineStageCounts={pipelineStageCounts}
        stats={stats}
      />

      {filterOpen && (
        <FilterBar
          team={team}
          value={filter}
          onChange={setFilter}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {/* mobile: swipe de uma etapa por vez (scroll-snap, estilo Groner) */}
      <div className="flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden px-4 pb-4 pt-3 md:snap-none">
        <DndContext
          id="kanban-board"
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {/* Colunas modelo Pipedrive: divididas por linhas verticais, sem gap */}
          <div className="flex h-full">
            <SortableContext
              items={stages.map((s) => `COL_${s.id}`)}
              strategy={horizontalListSortingStrategy}
            >
              {stages.map((stage) => (
                <StageColumn
                  key={stage.id}
                  stage={stage}
                  allStages={stages}
                  leads={(items[stage.id] ?? []).filter((l) =>
                    leadMatches(l, stage, filter)
                  )}
                  team={team}
                  currentUserId={currentUserId}
                  configMode={configMode}
                  onAdd={() => setNewLeadStage(stage.id)}
                />
              ))}
            </SortableContext>
            {configMode && (
              <button
                onClick={addStage}
                disabled={busy}
                className="ml-3 flex h-12 w-72 shrink-0 items-center justify-center gap-1.5 self-start rounded-xl border border-dashed border-[var(--color-border-strong)] text-sm text-[var(--color-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              >
                <Plus className="h-4 w-4" />
                Criar etapa
              </button>
            )}
          </div>

          <DragOverlay>
            {activeStage ? (
              <div className="flex w-72 items-center gap-2 rounded-xl border border-[var(--color-primary)] bg-[var(--color-surface)] px-3 py-2.5 shadow-2xl">
                <GripVertical className="h-4 w-4 text-[var(--color-muted)]" />
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: activeStage.color }}
                />
                <span className="text-sm font-medium">{activeStage.name}</span>
              </div>
            ) : activeLead ? (
              <LeadCard lead={activeLead} overlay />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {newLeadStage && (
        <NewLeadDialog
          pipelineId={pipeline.id}
          stageId={newLeadStage}
          team={team}
          onClose={() => setNewLeadStage(null)}
        />
      )}
      {slaOpen && (
        <StageSlaDialog stages={stages} onClose={() => setSlaOpen(false)} />
      )}
    </div>
  );
}
