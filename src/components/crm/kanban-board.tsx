"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import {
  Plus,
  Timer,
  Trash2,
  Loader2,
  Filter,
  GripVertical,
  BarChart3,
} from "lucide-react";
import { LeadCard, type BoardLead } from "./lead-card";
import { NewLeadDialog } from "./new-lead-dialog";
import { StageSlaDialog } from "./stage-sla-dialog";
import { PipelineSelect } from "./pipeline-select";
import {
  FilterBar,
  EMPTY_FILTER,
  activeFilterCount,
  type LeadFilter,
} from "./filter-bar";
import {
  moveLead,
  reorderStage,
  createStage,
  updateStage,
  deleteStage,
  reorderStages,
  moveAllLeads,
} from "@/app/(dashboard)/crm/actions";
import { currencyBRL, stageTimeInfo } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { useRole } from "@/components/role-context";
import { can } from "@/lib/permissions";
import type { Pipeline, PipelineStage, Profile } from "@/lib/types";

type Items = Record<string, BoardLead[]>;

function buildItems(stages: PipelineStage[], leads: BoardLead[]): Items {
  const map: Items = {};
  for (const s of stages) map[s.id] = [];
  for (const l of leads) {
    if (l.stage_id && map[l.stage_id]) map[l.stage_id].push(l);
  }
  return map;
}

const PALETTE = [
  "#1d6fff", "#00d4ff", "#00e5a0", "#fbbf24",
  "#f59e0b", "#ff5c5c", "#f472b6", "#a78bfa", "#8b9bb4",
];

export function KanbanBoard({
  pipeline,
  pipelines,
  stages,
  initialLeads,
  team,
  currentUserId,
  pipelineLeadCounts = {},
  pipelineStageCounts = {},
  stats,
}: {
  pipeline: Pipeline;
  pipelines: Pipeline[];
  stages: PipelineStage[];
  initialLeads: BoardLead[];
  team: Profile[];
  currentUserId: string;
  pipelineLeadCounts?: Record<string, number>;
  pipelineStageCounts?: Record<string, number>;
  stats?: {
    openCount: number;
    openValue: number;
    wonCount: number;
    wonValue: number;
    lostCount: number;
  };
}) {
  const router = useRouter();
  const role = useRole();
  const canConfig = can.configurePipelines(role);
  const [items, setItems] = useState<Items>(() => buildItems(stages, initialLeads));
  // Re-sincroniza quando o servidor manda dados novos (lead criado/editado,
  // router.refresh()). Sem isto o board fica com o estado local antigo e o
  // card novo só aparecia recarregando a página. initialLeads/stages só mudam
  // de referência num refetch do servidor, então drags locais não disparam isto.
  const [activeId, setActiveId] = useState<string | null>(null);
  // Snapshot do board no início do arrasto — restaurado se o servidor recusar.
  const dragSnapshot = useRef<Items | null>(null);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  useEffect(() => {
    // não re-sincroniza no MEIO de um arrasto (o refetch teleportaria o card)
    if (activeIdRef.current) return;
    setItems(buildItems(stages, initialLeads));
  }, [initialLeads, stages]);

  // Board AO VIVO: lead novo do WhatsApp e cards movidos por automação
  // aparecem sem F5 (realtime + refresh ao focar a aba + tick de 60s).
  const supabase = useMemo(() => createClient(), []);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (activeIdRef.current) return; // nunca durante um arrasto
      if (t) clearTimeout(t);
      t = setTimeout(() => router.refresh(), 800);
    };
    const channel = supabase
      .channel(`kanban-live`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        refresh
      )
      .subscribe();
    const onFocus = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    const iv = setInterval(refresh, 60_000);
    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      clearInterval(iv);
      if (t) clearTimeout(t);
    };
  }, [supabase, router]);
  const [newLeadStage, setNewLeadStage] = useState<string | null>(null);
  const [slaOpen, setSlaOpen] = useState(false);
  const [configMode, setConfigMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState<LeadFilter>(EMPTY_FILTER);

  function leadMatches(lead: BoardLead, stage: PipelineStage): boolean {
    const q = filter.q.trim().toLowerCase();
    if (q) {
      const hay = `${lead.name} ${lead.company ?? ""} ${lead.phone ?? ""} ${
        lead.email ?? ""
      }`.toLowerCase();
      // Identificação por número: código exato (#42 ou 42) e celular
      // com qualquer formatação (compara só os dígitos, mínimo 4).
      const digits = q.replace(/\D/g, "");
      const codeHit = digits !== "" && String(lead.code ?? "") === digits;
      const phoneHit =
        digits.length >= 4 &&
        (lead.phone ?? "").replace(/\D/g, "").includes(digits);
      if (!hay.includes(q) && !codeHit && !phoneHit) return false;
    }
    if (filter.ownerId === "none" && lead.owner_id) return false;
    if (filter.ownerId && filter.ownerId !== "none" && lead.owner_id !== filter.ownerId)
      return false;
    if (filter.source && lead.source !== filter.source) return false;
    if (filter.late) {
      const closed = stage.is_won || stage.is_lost;
      const info = stageTimeInfo(lead.stage_changed_at, stage.sla_days, closed);
      if (info.level !== "late") return false;
    }
    if (filter.withTask && !(lead.tasks ?? []).some((t) => !t.done)) return false;
    if (filter.createdFrom || filter.createdTo) {
      const created = new Date(lead.created_at);
      if (filter.createdFrom && created < new Date(`${filter.createdFrom}T00:00:00`))
        return false;
      if (filter.createdTo && created > new Date(`${filter.createdTo}T23:59:59`))
        return false;
    }
    return true;
  }

  // KeyboardSensor: espaço pega o card, setas movem entre etapas, espaço solta.
  // Sem ele mover um negócio de etapa exigia mouse.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const activeLead = useMemo(() => {
    if (!activeId) return null;
    for (const list of Object.values(items)) {
      const found = list.find((l) => l.id === activeId);
      if (found) return found;
    }
    return null;
  }, [activeId, items]);

  const activeStage =
    activeId && activeId.startsWith("COL_")
      ? stages.find((s) => s.id === activeId.slice(4)) ?? null
      : null;

  function findContainer(id: string): string | null {
    if (id in items) return id;
    return (
      Object.keys(items).find((key) => items[key].some((l) => l.id === id)) ??
      null
    );
  }

  function handleDragStart(e: DragStartEvent) {
    dragSnapshot.current = items;
    setActiveId(String(e.active.id));
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeContainer = findContainer(String(active.id));
    const overContainer = findContainer(String(over.id));
    if (!activeContainer || !overContainer || activeContainer === overContainer)
      return;

    setItems((prev) => {
      const activeItems = prev[activeContainer];
      const overItems = prev[overContainer];
      const activeIndex = activeItems.findIndex((l) => l.id === active.id);
      if (activeIndex === -1) return prev;
      const moved = activeItems[activeIndex];
      const overIndex = overItems.findIndex((l) => l.id === over.id);
      const insertAt = overIndex === -1 ? overItems.length : overIndex;
      return {
        ...prev,
        [activeContainer]: activeItems.filter((l) => l.id !== active.id),
        [overContainer]: [
          ...overItems.slice(0, insertAt),
          { ...moved, stage_id: overContainer },
          ...overItems.slice(insertAt),
        ],
      };
    });
  }

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);

    // Reordenar COLUNAS (etapas) — ids prefixados com COL_ no modo Configurar
    if (String(active.id).startsWith("COL_")) {
      if (!over) return;
      const fromId = String(active.id).slice(4);
      const overId = String(over.id);
      // o alvo pode vir como COL_, como o id da etapa (droppable interno),
      // ou como id de um lead — resolve pra etapa em qualquer caso.
      let toId: string | null = null;
      if (overId.startsWith("COL_")) toId = overId.slice(4);
      else if (stages.some((s) => s.id === overId)) toId = overId;
      else toId = findContainer(overId);
      if (!toId || fromId === toId) return;
      const ids = stages.map((s) => s.id);
      const from = ids.indexOf(fromId);
      const to = ids.indexOf(toId);
      if (from === -1 || to === -1) return;
      setBusy(true);
      await reorderStages(arrayMove(ids, from, to));
      setBusy(false);
      router.refresh();
      return;
    }

    if (!over) return;
    const container =
      findContainer(String(over.id)) ?? findContainer(String(active.id));
    if (!container) return;

    let finalIds: string[] = [];
    setItems((prev) => {
      const list = prev[container];
      const oldIndex = list.findIndex((l) => l.id === active.id);
      const newIndex =
        over.id in prev
          ? list.length - 1
          : list.findIndex((l) => l.id === over.id);
      const reordered =
        oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex
          ? arrayMove(list, oldIndex, newIndex)
          : list;
      finalIds = reordered.map((l) => l.id);
      return { ...prev, [container]: reordered };
    });

    const snapshot = dragSnapshot.current;
    dragSnapshot.current = null;
    const r = await moveLead({
      leadId: String(active.id),
      toStageId: container,
      orderedIds: finalIds,
    });
    if (r && "error" in r && r.error) {
      // servidor recusou (RLS/rede): volta o board pro estado pré-arrasto
      if (snapshot) setItems(snapshot);
      toast(`Não foi possível mover o card: ${r.error}`, { type: "error" });
      return;
    }

    // Undo: só quando trocou de etapa (e não pra etapa Ganho — o card já
    // foi promovido pro funil de CS pelo trigger, voltar deixaria inconsistente)
    if (snapshot) {
      const fromContainer = Object.keys(snapshot).find((k) =>
        snapshot[k].some((l) => l.id === active.id)
      );
      const destStage = stages.find((s) => s.id === container);
      if (fromContainer && fromContainer !== container && !destStage?.is_won) {
        const prevOrder = snapshot[fromContainer].map((l) => l.id);
        toast(`Card movido para "${destStage?.name ?? "etapa"}"`, {
          action: {
            label: "Desfazer",
            onClick: async () => {
              setItems(snapshot);
              await moveLead({
                leadId: String(active.id),
                toStageId: fromContainer,
                orderedIds: prevOrder,
              });
              router.refresh();
            },
          },
        });
      }
    }
  }

  async function addStage() {
    setBusy(true);
    const r = await createStage(pipeline.id, "Nova etapa");
    setBusy(false);
    if (r && "error" in r) toast(r.error, { type: "error" });
    router.refresh();
  }

  // Etapa alvo do "+ Negócio" do topo: a primeira etapa aberta do funil.
  const firstOpenStage =
    stages.find((s) => !s.is_won && !s.is_lost) ?? stages[0] ?? null;
  const filterCount = activeFilterCount(filter);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Topo modelo Pipedrive: ação primária + funil + resumo inline + ícones */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5">
        <button
          onClick={() => firstOpenStage && setNewLeadStage(firstOpenStage.id)}
          disabled={!firstOpenStage}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3.5 py-1.5 text-sm font-semibold text-[var(--color-on-accent)] shadow-sm transition hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Negócio
        </button>
        <PipelineSelect
          pipelines={pipelines}
          active={pipeline}
          canConfig={canConfig}
          leadCounts={pipelineLeadCounts}
          stageCounts={pipelineStageCounts}
        />
        {configMode && (
          <button
            onClick={addStage}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            <Plus className="h-3.5 w-3.5" />
            Criar etapa
          </button>
        )}

        {stats && (
          <p className="hidden items-center text-xs tabular-nums text-[var(--color-muted)] md:flex">
            <span className="font-semibold text-[var(--color-foreground)]">
              {currencyBRL(stats.openValue)}
            </span>
            <span className="ml-1">
              · {stats.openCount} negócio{stats.openCount === 1 ? "" : "s"}
            </span>
            <span className="mx-2.5 text-[var(--color-border-strong)]">|</span>
            <span
              className="font-semibold text-[var(--color-success)]"
              title={`${currencyBRL(stats.wonValue)} em vendas ganhas no mês`}
            >
              {stats.wonCount} ganho{stats.wonCount === 1 ? "" : "s"}
            </span>
            <span className="mx-1">·</span>
            <span className="font-semibold text-[var(--color-danger)]">
              {stats.lostCount} perdido{stats.lostCount === 1 ? "" : "s"}
            </span>
            <span className="ml-1">no mês</span>
          </p>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {busy && (
            <Loader2 className="h-4 w-4 animate-spin text-[var(--color-muted)]" />
          )}
          {can.viewReports(role) && (
            <Link
              href="/crm/relatorios"
              title="Relatórios"
              aria-label="Relatórios"
              className="hidden h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border-strong)] text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] md:flex"
            >
              <BarChart3 className="h-4 w-4" />
            </Link>
          )}
          <button
            onClick={() => setFilterOpen((o) => !o)}
            title="Filtros"
            aria-label="Filtros"
            className={`relative flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
              filterOpen || filterCount > 0
                ? "border-[var(--color-primary)] bg-[var(--color-primary)]/8 text-[var(--color-primary)]"
                : "border-[var(--color-border-strong)] text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
            }`}
          >
            <Filter className="h-4 w-4" />
            {filterCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-primary)] px-1 text-[11px] font-semibold text-[var(--color-on-accent)]">
                {filterCount}
              </span>
            )}
          </button>
          {canConfig && (
            <>
              <button
                onClick={() => setSlaOpen(true)}
                title="Prazos das etapas"
                aria-label="Prazos das etapas"
                className="hidden h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border-strong)] text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] md:flex"
              >
                <Timer className="h-4 w-4" />
              </button>
              <label className="hidden h-8 cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-border-strong)] px-2.5 text-xs font-medium text-[var(--color-muted)] md:flex">
                Configurar
                <span
                  role="switch"
                  aria-checked={configMode}
                  aria-label="Configurar"
                  onClick={() => setConfigMode((c) => !c)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    configMode
                      ? "bg-[var(--color-primary)]"
                      : "bg-[var(--color-border-strong)]"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      configMode ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </span>
              </label>
            </>
          )}
        </div>
      </div>

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
                    leadMatches(l, stage)
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

function StageColumn({
  stage,
  allStages,
  leads,
  team,
  currentUserId,
  configMode,
  onAdd,
}: {
  stage: PipelineStage;
  allStages: PipelineStage[];
  leads: BoardLead[];
  team: Profile[];
  currentUserId: string;
  configMode: boolean;
  onAdd: () => void;
}) {
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

function StageConfigHeader({
  stage,
  allStages,
  leadCount,
  dragHandleProps,
}: {
  stage: PipelineStage;
  allStages: PipelineStage[];
  leadCount: number;
  dragHandleProps: Record<string, unknown>;
}) {
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
                {PALETTE.map((c) => (
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
