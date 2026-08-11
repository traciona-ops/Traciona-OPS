"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import {
  moveLead,
  createStage,
  reorderStages,
} from "@/app/(dashboard)/crm/actions";
import { toast } from "@/components/ui/toast";
import { EMPTY_FILTER, activeFilterCount, type LeadFilter } from "../filter-bar";
import type { BoardLead } from "../lead-card";
import type { Pipeline, PipelineStage } from "@/lib/types";
import { buildItems, type Items } from "./types";
import { useKanbanLive } from "./use-kanban-live";

export function useKanbanBoard(
  pipeline: Pipeline,
  stages: PipelineStage[],
  initialLeads: BoardLead[]
) {
  const router = useRouter();
  const [items, setItems] = useState<Items>(() => buildItems(stages, initialLeads));
  const [activeId, setActiveId] = useState<string | null>(null);
  const dragSnapshot = useRef<Items | null>(null);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  // Re-sincroniza quando o servidor manda dados novos (lead criado/editado,
  // router.refresh()). Sem isto o board fica com o estado local antigo e o
  // card novo só aparecia recarregando a página. initialLeads/stages só mudam
  // de referência num refetch do servidor, então drags locais não disparam isto.
  useEffect(() => {
    // não re-sincroniza no MEIO de um arrasto (o refetch teleportaria o card)
    if (activeIdRef.current) return;
    setItems(buildItems(stages, initialLeads));
  }, [initialLeads, stages]);

  useKanbanLive(activeIdRef);

  const [newLeadStage, setNewLeadStage] = useState<string | null>(null);
  const [slaOpen, setSlaOpen] = useState(false);
  const [configMode, setConfigMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState<LeadFilter>(EMPTY_FILTER);

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

  const firstOpenStage =
    stages.find((s) => !s.is_won && !s.is_lost) ?? stages[0] ?? null;
  const filterCount = activeFilterCount(filter);

  return {
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
  };
}
