"use client";

import Link from "next/link";
import {
  Plus,
  Timer,
  Loader2,
  Filter,
  BarChart3,
} from "lucide-react";
import { PipelineSelect } from "../pipeline-select";
import { currencyBRL } from "@/lib/utils/ui";
import { can } from "@/lib/permissions";
import { useRole } from "@/components/context/role-context";
import type { Pipeline, PipelineStage } from "@/lib/types";
import type { KanbanStats } from "./types";

type KanbanHeaderProps = {
  pipeline: Pipeline;
  pipelines: Pipeline[];
  stages: PipelineStage[];
  canConfig: boolean;
  configMode: boolean;
  onConfigModeChange: (value: boolean) => void;
  busy: boolean;
  filterOpen: boolean;
  filterCount: number;
  onFilterToggle: () => void;
  onSlaOpen: () => void;
  onAddStage: () => void;
  onNewLead: () => void;
  firstOpenStage: PipelineStage | null;
  pipelineLeadCounts?: Record<string, number>;
  pipelineStageCounts?: Record<string, number>;
  stats?: KanbanStats;
};

export function KanbanHeader({
  pipeline,
  pipelines,
  canConfig,
  configMode,
  onConfigModeChange,
  busy,
  filterOpen,
  filterCount,
  onFilterToggle,
  onSlaOpen,
  onAddStage,
  onNewLead,
  firstOpenStage,
  pipelineLeadCounts,
  pipelineStageCounts,
  stats,
}: KanbanHeaderProps) {
  const role = useRole();

  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5">
      <button
        onClick={() => firstOpenStage && onNewLead()}
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
          onClick={onAddStage}
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
          onClick={onFilterToggle}
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
              onClick={onSlaOpen}
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
                onClick={() => onConfigModeChange(!configMode)}
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
  );
}
