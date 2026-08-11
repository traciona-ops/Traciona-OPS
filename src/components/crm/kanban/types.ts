import type { BoardLead } from "../lead-card";
import type { Pipeline, PipelineStage, Profile } from "@/lib/types";

export type Items = Record<string, BoardLead[]>;

export function buildItems(stages: PipelineStage[], leads: BoardLead[]): Items {
  const map: Items = {};
  for (const s of stages) map[s.id] = [];
  for (const l of leads) {
    if (l.stage_id && map[l.stage_id]) map[l.stage_id].push(l);
  }
  return map;
}

export const STAGE_COLOR_PALETTE = [
  "#1d6fff", "#00d4ff", "#00e5a0", "#fbbf24",
  "#f59e0b", "#ff5c5c", "#f472b6", "#a78bfa", "#8b9bb4",
];

export type KanbanStats = {
  openCount: number;
  openValue: number;
  wonCount: number;
  wonValue: number;
  lostCount: number;
};

export type KanbanBoardProps = {
  pipeline: Pipeline;
  pipelines: Pipeline[];
  stages: PipelineStage[];
  initialLeads: BoardLead[];
  team: Profile[];
  currentUserId: string;
  pipelineLeadCounts?: Record<string, number>;
  pipelineStageCounts?: Record<string, number>;
  stats?: KanbanStats;
};
