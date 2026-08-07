import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { requireModule } from "@/lib/access";
import { KanbanBoard } from "@/components/crm/kanban-board";
import { monthBoundsBR } from "@/lib/dates";
import type { Lead, Pipeline, PipelineStage, Profile } from "@/lib/types";

export const metadata = { title: "Negócios" };

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  await requireModule("crm");
  const { p } = await searchParams;
  const profile = await getProfile();
  const supabase = await createClient();

  // As três consultas são independentes: em série custavam dois round-trips
  // encadeados ao Postgres a cada carregamento da tela de negócios.
  // Contagem de leads/etapas por funil alimenta o seletor e o aviso de exclusão.
  const [{ data: pipelines }, { data: leadPids }, { data: stagePids }] =
    await Promise.all([
      supabase
        .from("pipelines")
        .select("*")
        .eq("archived", false)
        .order("position"),
      supabase.from("leads").select("pipeline_id"),
      supabase.from("pipeline_stages").select("pipeline_id"),
    ]);

  const pipeList = (pipelines ?? []) as Pipeline[];
  const activePipeline =
    pipeList.find((pl) => pl.id === p) ?? pipeList[0] ?? null;
  const pipelineLeadCounts: Record<string, number> = {};
  for (const r of (leadPids ?? []) as { pipeline_id: string | null }[]) {
    if (r.pipeline_id)
      pipelineLeadCounts[r.pipeline_id] =
        (pipelineLeadCounts[r.pipeline_id] ?? 0) + 1;
  }
  const pipelineStageCounts: Record<string, number> = {};
  for (const r of (stagePids ?? []) as { pipeline_id: string | null }[]) {
    if (r.pipeline_id)
      pipelineStageCounts[r.pipeline_id] =
        (pipelineStageCounts[r.pipeline_id] ?? 0) + 1;
  }

  let stages: PipelineStage[] = [];
  let leads: Lead[] = [];
  let team: Profile[] = [];

  if (activePipeline) {
    const [stagesRes, leadsRes, teamRes] = await Promise.all([
      supabase
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", activePipeline.id)
        .order("position"),
      supabase
        .from("leads")
        .select(
          "*, tags:lead_tags(*), owner:profiles(*), tasks:lead_tasks(id,done,due_date)"
        )
        .eq("pipeline_id", activePipeline.id)
        .order("position"),
      supabase.from("profiles").select("*").eq("active", true),
    ]);
    stages = (stagesRes.data ?? []) as PipelineStage[];
    leads = (leadsRes.data ?? []) as unknown as Lead[];
    team = (teamRes.data ?? []) as Profile[];
  }

  // Faixa de KPIs do board (estilo Groner): aberto no funil + ganhos/perdidos do mês
  const { monthStart } = monthBoundsBR();
  const [wonRes, lostRes] = await Promise.all([
    supabase.from("leads").select("value").gte("won_at", monthStart.toISOString()),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("lost_at", monthStart.toISOString()),
  ]);
  const closedStageIds = new Set(
    stages.filter((s) => s.is_won || s.is_lost).map((s) => s.id)
  );
  const openLeads = leads.filter(
    (l) => l.stage_id && !closedStageIds.has(l.stage_id)
  );
  const boardStats = {
    openCount: openLeads.length,
    openValue: openLeads.reduce((a, l) => a + (l.value ?? 0), 0),
    wonCount: (wonRes.data ?? []).length,
    wonValue: ((wonRes.data ?? []) as { value: number | null }[]).reduce(
      (a, l) => a + (l.value ?? 0),
      0
    ),
    lostCount: lostRes.count ?? 0,
  };

  return (
    <>
      <div className="flex flex-1 flex-col overflow-hidden">
        {pipeList.length === 0 ? (
          <EmptyState />
        ) : (
          <KanbanBoard
            key={activePipeline!.id}
            pipeline={activePipeline!}
            pipelines={pipeList}
            stages={stages}
            initialLeads={leads}
            team={team}
            currentUserId={profile.id}
            pipelineLeadCounts={pipelineLeadCounts}
            pipelineStageCounts={pipelineStageCounts}
            stats={boardStats}
          />
        )}
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center p-10">
      <div className="card max-w-md p-8 text-center">
        <h2 className="mb-2 text-lg font-semibold">Nenhum funil ainda</h2>
        <p className="text-sm text-[var(--color-muted)]">
          Crie seu primeiro funil de vendas no seletor ali em cima (botão
          &ldquo;Criar funil&rdquo;) pra começar a organizar os leads.
        </p>
      </div>
    </div>
  );
}
