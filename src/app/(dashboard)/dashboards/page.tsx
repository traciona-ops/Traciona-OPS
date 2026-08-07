import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { requireModule } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { currencyBRL } from "@/lib/utils";
import { TZ, monthBoundsBR, ymdBR } from "@/lib/dates";
import { GoalBar } from "@/components/goal-bar";
import { Avatar } from "@/components/ui/avatar";
import { TrendChart, type TrendPoint } from "@/components/dashboards/trend-chart";
import {
  SOURCE_LABEL,
  type LeadSource,
  type Pipeline,
  type PipelineStage,
  type Profile,
} from "@/lib/types";

export const metadata = { title: "Dashboards" };

// Dashboard estilo Pipedrive Insights: grade de widgets, número grande no
// cabeçalho, colunas com grade e rótulo, funil centralizado e rosca por origem.
// Tudo calculado dos dados reais — sem dado, o widget mostra o estado vazio.

const BR_OFFSET = "-03:00";

type KpiLead = {
  id: string;
  name: string;
  stage_id: string | null;
  pipeline_id: string | null;
  owner_id: string | null;
  source: LeadSource;
  value: number | null;
  created_at: string;
  won_at: string | null;
  lost_at: string | null;
};

type HistoryRow = {
  lead_id: string;
  from_stage_id: string | null;
  to_stage_id: string | null;
  created_at: string;
};

type PeriodKey = "mes" | "30d" | "90d" | "ano";
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "mes", label: "Este mês" },
  { key: "30d", label: "30 dias" },
  { key: "90d", label: "90 dias" },
  { key: "ano", label: "Este ano" },
];

function periodStart(key: PeriodKey, now: Date): Date {
  if (key === "30d") return new Date(now.getTime() - 30 * 864e5);
  if (key === "90d") return new Date(now.getTime() - 90 * 864e5);
  if (key === "ano")
    return new Date(`${ymdBR(now).slice(0, 4)}-01-01T00:00:00${BR_OFFSET}`);
  return monthBoundsBR(now).monthStart;
}

const fmtDur = (ms: number) => {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h ${min % 60}min`;
  return `${Math.round(h / 24)} dias`;
};

const fmtDays = (ms: number) => {
  const d = ms / 864e5;
  if (d < 1) return `${Math.round(d * 24)}h`;
  return `${d.toFixed(d < 10 ? 1 : 0)}d`;
};

const kShort = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n));

// Sem verde/laranja/vermelho: essas cores são reservadas pra semântica
// (bom/alerta/ruim) e não pra categorias (VibeUX 6.10).
const DONUT_COLORS = [
  "#1d6fff",
  "#7c3aed",
  "#0ea5e9",
  "#db2777",
  "#64748b",
  "#94a3b8",
];

export default async function DashboardsPage({
  searchParams,
}: {
  searchParams: Promise<{ per?: string }>;
}) {
  const { per } = await searchParams;
  const period: PeriodKey = (PERIODS.find((p) => p.key === per)?.key ??
    "mes") as PeriodKey;
  await getProfile();
  await requireModule("dashboards");
  const supabase = await createClient();

  const now = new Date();
  const start = periodStart(period, now);
  const startIso = start.toISOString();
  const monthKey = ymdBR().slice(0, 7);

  const [leadsRes, pipelinesRes, stagesRes, historyRes, tasksRes, meetingsRes, msgsRes, teamRes, goalRes] =
    await Promise.all([
      supabase
        .from("leads")
        .select(
          "id,name,stage_id,pipeline_id,owner_id,source,value,created_at,won_at,lost_at"
        )
        .limit(10000),
      supabase.from("pipelines").select("*").eq("archived", false).order("position"),
      supabase.from("pipeline_stages").select("*").order("position"),
      supabase
        .from("lead_stage_history")
        .select("lead_id,from_stage_id,to_stage_id,created_at")
        .order("created_at", { ascending: true })
        .limit(10000),
      supabase
        .from("lead_tasks")
        .select("id,assignee_id,done,completed_at,due_date")
        .limit(10000),
      supabase
        .from("meetings")
        .select("id,created_by,starts_at")
        .gte("starts_at", startIso),
      supabase
        .from("whatsapp_messages")
        .select("lead_id,direction,created_at")
        .gte("created_at", startIso)
        .order("created_at", { ascending: true })
        .limit(10000),
      supabase.from("profiles").select("*").eq("active", true),
      supabase
        .from("org_goals")
        .select("revenue_target")
        .eq("month", monthKey)
        .maybeSingle(),
    ]);

  const allLeads = (leadsRes.data ?? []) as KpiLead[];
  const pipelines = (pipelinesRes.data ?? []) as Pipeline[];
  const stages = (stagesRes.data ?? []) as PipelineStage[];
  const history = (historyRes.data ?? []) as HistoryRow[];
  const tasks = (tasksRes.data ?? []) as {
    id: string;
    assignee_id: string | null;
    done: boolean;
    completed_at: string | null;
    due_date: string | null;
  }[];
  const meetings = (meetingsRes.data ?? []) as {
    id: string;
    created_by: string | null;
    starts_at: string;
  }[];
  const msgs = (msgsRes.data ?? []) as {
    lead_id: string;
    direction: "in" | "out";
    created_at: string;
  }[];
  const team = (teamRes.data ?? []) as Profile[];
  const goalTarget = Number(
    (goalRes.data as { revenue_target?: number } | null)?.revenue_target ?? 0
  );

  // ---------- base: vendas (sem funis de CS) ----------
  const csIds = new Set(pipelines.filter((p) => p.is_cs).map((p) => p.id));
  const leads = allLeads.filter(
    (l) => !l.pipeline_id || !csIds.has(l.pipeline_id)
  );
  const wonStageIds = new Set(stages.filter((s) => s.is_won).map((s) => s.id));
  const lostStageIds = new Set(stages.filter((s) => s.is_lost).map((s) => s.id));
  const inPeriod = (iso: string | null) => !!iso && new Date(iso) >= start;

  const openLeads = leads.filter(
    (l) =>
      l.stage_id && !wonStageIds.has(l.stage_id) && !lostStageIds.has(l.stage_id)
  );
  const pipelineValue = openLeads.reduce((a, l) => a + (l.value ?? 0), 0);
  const wonAll = allLeads.filter((l) => l.won_at);
  const wonPeriod = wonAll.filter((l) => inPeriod(l.won_at));
  const wonPeriodValue = wonPeriod.reduce((a, l) => a + (l.value ?? 0), 0);
  const lostAllCount = leads.filter(
    (l) => l.lost_at || (l.stage_id && lostStageIds.has(l.stage_id))
  ).length;
  const closedAll = wonAll.length + lostAllCount;
  const winRate = closedAll > 0 ? wonAll.length / closedAll : 0;
  const newPeriod = leads.filter((l) => inPeriod(l.created_at));
  const ticket = wonPeriod.length ? wonPeriodValue / wonPeriod.length : 0;
  const forecast = pipelineValue * winRate;

  // ---------- comparação: mesmo tamanho de janela, imediatamente antes ----------
  const spanMs = Math.max(864e5, now.getTime() - start.getTime());
  const prevStart = new Date(start.getTime() - spanMs);
  const inPrevPeriod = (iso: string | null) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= prevStart.getTime() && t < start.getTime();
  };
  const wonPrevValue = wonAll
    .filter((l) => inPrevPeriod(l.won_at))
    .reduce((a, l) => a + (l.value ?? 0), 0);
  const newPrevCount = leads.filter((l) => inPrevPeriod(l.created_at)).length;

  // ---------- séries mensais (últimos 6 meses) ----------
  const monthKeys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getTime());
    d.setUTCMonth(d.getUTCMonth() - i);
    monthKeys.push(d.toLocaleDateString("en-CA", { timeZone: TZ }).slice(0, 7));
  }
  const monthOf = (iso: string) =>
    new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ }).slice(0, 7);
  const monthLabel = (k: string) =>
    new Date(`${k}-15T12:00:00${BR_OFFSET}`).toLocaleDateString("pt-BR", {
      timeZone: TZ,
      month: "short",
    });

  const wonByMonth = monthKeys.map((k) => ({
    label: monthLabel(k),
    value: wonAll
      .filter((l) => monthOf(l.won_at!) === k)
      .reduce((a, l) => a + (l.value ?? 0), 0),
    highlight: k === monthKey,
  }));
  const createdByMonth = monthKeys.map((k) => ({
    label: monthLabel(k),
    value: leads.filter((l) => monthOf(l.created_at) === k).length,
    highlight: k === monthKey,
  }));

  // ---------- funil de conversão ----------
  const salesPipeline = pipelines.find((p) => !p.is_cs) ?? pipelines[0] ?? null;
  const funnelStages = salesPipeline
    ? stages.filter((s) => s.pipeline_id === salesPipeline.id && !s.is_lost)
    : [];

  const firstEvent = new Map<string, HistoryRow>();
  for (const h of history)
    if (!firstEvent.has(h.lead_id)) firstEvent.set(h.lead_id, h);

  const entered = new Map<string, Set<string>>();
  const addEntered = (stageId: string | null, leadId: string) => {
    if (!stageId) return;
    if (!entered.has(stageId)) entered.set(stageId, new Set());
    entered.get(stageId)!.add(leadId);
  };
  for (const l of leads) {
    if (!inPeriod(l.created_at)) continue;
    addEntered(firstEvent.get(l.id)?.from_stage_id ?? l.stage_id, l.id);
  }
  for (const h of history)
    if (inPeriod(h.created_at)) addEntered(h.to_stage_id, h.lead_id);

  const leadCreated = new Map(leads.map((l) => [l.id, l.created_at]));
  const enteredAt = new Map<string, number>();
  const stageDur = new Map<string, number[]>();
  for (const h of history) {
    const t = new Date(h.created_at).getTime();
    if (h.from_stage_id) {
      const key = `${h.lead_id}|${h.from_stage_id}`;
      const started =
        enteredAt.get(key) ??
        (firstEvent.get(h.lead_id)?.from_stage_id === h.from_stage_id
          ? new Date(leadCreated.get(h.lead_id) ?? h.created_at).getTime()
          : null);
      if (started != null && inPeriod(h.created_at)) {
        if (!stageDur.has(h.from_stage_id)) stageDur.set(h.from_stage_id, []);
        stageDur.get(h.from_stage_id)!.push(Math.max(0, t - started));
      }
    }
    if (h.to_stage_id) enteredAt.set(`${h.lead_id}|${h.to_stage_id}`, t);
  }
  const funnel = funnelStages.map((s) => {
    const arr = stageDur.get(s.id) ?? [];
    return {
      stage: s,
      count: entered.get(s.id)?.size ?? 0,
      avg: arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null,
    };
  });
  const funnelMax = Math.max(1, ...funnel.map((f) => f.count));
  const funnelHasData = funnel.some((f) => f.count > 0);

  // ---------- origem (rosca) ----------
  const bySource = new Map<
    LeadSource,
    { leads: number; wonValue: number }
  >();
  for (const l of newPeriod) {
    if (!bySource.has(l.source)) bySource.set(l.source, { leads: 0, wonValue: 0 });
    bySource.get(l.source)!.leads++;
  }
  for (const l of wonPeriod) {
    if (!bySource.has(l.source)) bySource.set(l.source, { leads: 0, wonValue: 0 });
    bySource.get(l.source)!.wonValue += l.value ?? 0;
  }
  const sourceRows = [...bySource.entries()].sort(
    (a, b) => b[1].leads - a[1].leads
  );
  const sourceTotal = sourceRows.reduce((a, [, v]) => a + v.leads, 0);

  // ---------- time ----------
  const teamRows = team
    .map((m) => {
      const won = wonPeriod.filter((l) => l.owner_id === m.id);
      return {
        m,
        wonCount: won.length,
        wonValue: won.reduce((a, l) => a + (l.value ?? 0), 0),
        tasksDone: tasks.filter(
          (t) => t.assignee_id === m.id && t.done && inPeriod(t.completed_at)
        ).length,
        tasksLate: tasks.filter(
          (t) =>
            t.assignee_id === m.id &&
            !t.done &&
            t.due_date &&
            t.due_date < ymdBR()
        ).length,
        meetings: meetings.filter((mt) => mt.created_by === m.id).length,
      };
    })
    .sort((a, b) => b.wonValue - a.wonValue || b.wonCount - a.wonCount);
  const teamHasData = teamRows.some(
    (r) => r.wonCount || r.tasksDone || r.meetings
  );

  // ---------- WhatsApp ----------
  const inCount = msgs.filter((m) => m.direction === "in").length;
  const outCount = msgs.length - inCount;
  const firstIn = new Map<string, number>();
  const firstOutAfter = new Map<string, number>();
  for (const m of msgs) {
    const t = new Date(m.created_at).getTime();
    if (m.direction === "in") {
      if (!firstIn.has(m.lead_id)) firstIn.set(m.lead_id, t);
    } else if (firstIn.has(m.lead_id) && !firstOutAfter.has(m.lead_id)) {
      firstOutAfter.set(m.lead_id, t);
    }
  }
  const responseTimes = [...firstOutAfter.entries()].map(
    ([id, out]) => out - firstIn.get(id)!
  );
  const avgResponse = responseTimes.length
    ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    : null;
  const lastDir = new Map<string, "in" | "out">();
  for (const m of msgs) lastDir.set(m.lead_id, m.direction);
  const awaiting = [...lastDir.values()].filter((d) => d === "in").length;

  const dayKeys: string[] = [];
  for (let i = 13; i >= 0; i--)
    dayKeys.push(ymdBR(new Date(now.getTime() - i * 864e5)));
  const msgByDay = dayKeys.map((d) => {
    let vIn = 0,
      vOut = 0;
    for (const m of msgs)
      if (ymdBR(new Date(m.created_at)) === d)
        m.direction === "in" ? vIn++ : vOut++;
    return { label: d.slice(8), value: vIn + vOut };
  });

  const periodLabel = PERIODS.find((p) => p.key === period)!.label;

  // ---------- série do gráfico de tendência ----------
  const totalDays = Math.max(
    1,
    Math.ceil((now.getTime() - start.getTime()) / 864e5)
  );
  const weekly = totalDays > 35; // período longo agrupa por semana
  const bucketMs = (weekly ? 7 : 1) * 864e5;
  const bucketCount = Math.max(2, Math.ceil(totalDays / (weekly ? 7 : 1)));
  const trend: TrendPoint[] = Array.from({ length: bucketCount }, (_, i) => ({
    label: new Date(start.getTime() + i * bucketMs).toLocaleDateString("pt-BR", {
      timeZone: TZ,
      day: "2-digit",
      month: "2-digit",
    }),
    leads: 0,
    msgs: 0,
    revenue: 0,
  }));
  const bucketIdx = (iso: string) => {
    const i = Math.floor((new Date(iso).getTime() - start.getTime()) / bucketMs);
    return i >= 0 && i < bucketCount ? i : null;
  };
  for (const l of leads) {
    const i = bucketIdx(l.created_at);
    if (i != null) trend[i].leads++;
  }
  for (const mm of msgs) {
    const i = bucketIdx(mm.created_at);
    if (i != null) trend[i].msgs++;
  }
  for (const l of wonAll) {
    const i = bucketIdx(l.won_at!);
    if (i != null) trend[i].revenue += l.value ?? 0;
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--color-background)]">
      <div className="mx-auto max-w-6xl space-y-4 p-6 sm:p-8">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Dashboards</h1>
          <div className="flex rounded-xl bg-[var(--color-surface-2)] p-0.5 text-xs font-medium">
            {PERIODS.map((p) => (
              <Link
                key={p.key}
                href={`/dashboards?per=${p.key}`}
                className={`rounded-lg px-3 py-1.5 transition ${
                  period === p.key
                    ? "bg-[var(--color-surface)] font-semibold text-[var(--color-foreground)] shadow-sm"
                    : "text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                }`}
              >
                {p.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Números grandes (estilo Pipedrive) */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <BigNumber
            title="Negócios ganhos"
            period={periodLabel}
            value={currencyBRL(wonPeriodValue)}
            sub={`${wonPeriod.length} negócio${wonPeriod.length === 1 ? "" : "s"}`}
            accent="var(--color-success)"
            delta={{
              current: wonPeriodValue,
              previous: wonPrevValue,
              fmtPrev: currencyBRL(wonPrevValue),
            }}
          />
          <BigNumber
            title="Em aberto no funil"
            period="agora"
            value={currencyBRL(pipelineValue)}
            sub={`${openLeads.length} negócio${openLeads.length === 1 ? "" : "s"}`}
            accent="var(--color-primary)"
          />
          <BigNumber
            title="Novos leads"
            period={periodLabel}
            value={String(newPeriod.length)}
            sub="entraram no sistema"
            accent="#0ea5e9"
            delta={{
              current: newPeriod.length,
              previous: newPrevCount,
              fmtPrev: String(newPrevCount),
            }}
          />
          <BigNumber
            title="Taxa de conversão"
            period="histórica"
            value={`${Math.round(winRate * 100)}%`}
            sub={`ticket médio ${currencyBRL(ticket)}`}
            accent="#d97706"
          />
        </div>

        {/* Gráfico de tendência (linha/área interativo) */}
        <Widget
          title="Evolução no período"
          big=""
          sub={`${weekly ? "por semana" : "por dia"} · ${periodLabel.toLowerCase()} · passe o mouse pra ver os valores`}
        >
          <TrendChart data={trend} />
        </Widget>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Ganhos ao longo do tempo */}
          <Widget
            title="Negócios ganhos ao longo do tempo"
            big={currencyBRL(wonByMonth.reduce((a, b) => a + b.value, 0))}
            sub="últimos 6 meses"
          >
            {wonByMonth.every((m) => m.value === 0) ? (
              <Empty text="Nenhum negócio ganho ainda — as colunas sobem conforme você fechar vendas." />
            ) : (
              <Columns
                data={wonByMonth}
                color="var(--color-success)"
                fmt={(v) => `R$ ${kShort(v)}`}
              />
            )}
          </Widget>

          {/* Novos negócios ao longo do tempo */}
          <Widget
            title="Novos leads ao longo do tempo"
            big={String(createdByMonth.reduce((a, b) => a + b.value, 0))}
            sub="últimos 6 meses"
          >
            {createdByMonth.every((m) => m.value === 0) ? (
              <Empty text="Sem leads criados nos últimos meses." />
            ) : (
              <Columns
                data={createdByMonth}
                color="var(--color-primary)"
                fmt={(v) => String(v)}
              />
            )}
          </Widget>
        </div>

        {/* Funil de conversão (centralizado, estilo Pipedrive) */}
        <Widget
          title="Conversão do funil"
          big={funnelHasData ? `${funnel[0]?.count ?? 0} entradas` : ""}
          sub={`${salesPipeline?.name ?? "funil"} · ${periodLabel.toLowerCase()} · tempo médio por etapa`}
        >
          {!funnelHasData ? (
            <Empty text="Sem movimentações no período — conforme os cards andarem no funil, as passagens aparecem aqui." />
          ) : (
            <div className="space-y-1.5">
              {funnel.map((f, i) => {
                const prev = i > 0 ? funnel[i - 1].count : null;
                const pass =
                  prev && prev > 0 ? Math.round((f.count / prev) * 100) : null;
                const width = Math.max(14, (f.count / funnelMax) * 100);
                return (
                  <div key={f.stage.id} className="flex items-center gap-2">
                    <div className="w-24 shrink-0 truncate text-right text-xs font-medium text-[var(--color-muted)] sm:w-36">
                      {f.stage.name}
                    </div>
                    <div className="relative flex-1">
                      <div
                        className="mx-auto flex h-9 items-center justify-center rounded-lg text-xs font-bold text-[var(--color-on-accent)]"
                        style={{
                          width: `${width}%`,
                          backgroundColor: f.stage.is_won
                            ? "var(--color-success)"
                            : `color-mix(in srgb, var(--color-primary) ${100 - i * 12}%, #7aa8ff)`,
                        }}
                      >
                        {f.count}
                      </div>
                    </div>
                    <div className="w-20 shrink-0 text-xs tabular-nums text-[var(--color-muted)] sm:w-24">
                      {pass != null ? (
                        <span
                          className={
                            pass >= 50
                              ? "text-[var(--color-success)]"
                              : pass < 25
                              ? "text-[var(--color-danger)]"
                              : ""
                          }
                        >
                          ▾ {pass}%
                        </span>
                      ) : (
                        "—"
                      )}
                      {f.avg != null && (
                        <span className="text-[var(--color-muted-2)]">
                          {" "}
                          · {fmtDays(f.avg)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Widget>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Origem — barras horizontais (VibeUX 81: nunca pizza/rosca;
              83: rótulo comprido lê melhor na horizontal) */}
          <Widget
            title="Leads por origem"
            big={String(sourceTotal)}
            sub={periodLabel.toLowerCase()}
          >
            {sourceRows.length === 0 ? (
              <Empty text="Nenhum lead no período — as barras montam conforme os leads chegarem." />
            ) : (
              <div className="space-y-2.5">
                {sourceRows.map(([src, v], i) => {
                  const maxLeads = Math.max(
                    1,
                    ...sourceRows.map(([, x]) => x.leads)
                  );
                  const pct = Math.round(
                    (v.leads / Math.max(1, sourceTotal)) * 100
                  );
                  return (
                    <div key={src} className="flex items-center gap-2.5 text-sm">
                      <span className="w-24 shrink-0 truncate text-xs text-[var(--color-muted)]">
                        {SOURCE_LABEL[src]}
                      </span>
                      <div className="h-5 min-w-0 flex-1 overflow-hidden rounded-md bg-[var(--color-surface-2)]">
                        <div
                          className="h-full rounded-md"
                          style={{
                            width: `${Math.max(3, (v.leads / maxLeads) * 100)}%`,
                            backgroundColor:
                              DONUT_COLORS[i % DONUT_COLORS.length],
                          }}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-[var(--color-muted)]">
                        {v.leads} · {pct}%
                      </span>
                      {v.wonValue > 0 && (
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--color-success)]">
                          {currencyBRL(v.wonValue)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Widget>

          {/* Leaderboard */}
          <Widget title="Ranking do time" big="" sub={periodLabel.toLowerCase()}>
            {!teamHasData ? (
              <Empty text="Sem atividade no período — o ranking monta conforme o time fechar negócios e concluir tarefas." />
            ) : (
              <div className="space-y-1">
                {teamRows.map((r, i) => (
                  <div
                    key={r.m.id}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-[var(--color-surface-2)]/60"
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        i === 0
                          ? "bg-[#f59e0b]/15 text-[#b45309]"
                          : "bg-[var(--color-surface-2)] text-[var(--color-muted-2)]"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <Avatar name={r.m.name} src={r.m.avatar_url} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.m.name}</p>
                      <p className="text-[11px] text-[var(--color-muted)]">
                        {r.tasksDone} tarefa{r.tasksDone === 1 ? "" : "s"}
                        {r.tasksLate > 0 && (
                          <span className="text-[var(--color-danger)]">
                            {" "}
                            · {r.tasksLate} atrasada{r.tasksLate === 1 ? "" : "s"}
                          </span>
                        )}
                        {r.meetings > 0 && ` · ${r.meetings} reuniões`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums text-[var(--color-success)]">
                        {currencyBRL(r.wonValue)}
                      </p>
                      <p className="text-[11px] text-[var(--color-muted-2)]">
                        {r.wonCount} ganho{r.wonCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Widget>

          {/* WhatsApp */}
          <Widget
            title="Atendimento WhatsApp"
            big={avgResponse != null ? fmtDur(avgResponse) : "—"}
            sub="tempo médio da 1ª resposta"
          >
            <div className="mb-4 grid grid-cols-3 gap-3">
              <MiniStat label="Recebidas" value={String(inCount)} />
              <MiniStat label="Enviadas" value={String(outCount)} />
              <MiniStat
                label="Aguardando resposta"
                value={String(awaiting)}
                danger={awaiting > 0}
              />
            </div>
            {msgs.length === 0 ? (
              <Empty text="Sem mensagens no período." />
            ) : (
              <>
                <Columns
                  data={msgByDay}
                  color="var(--color-primary)"
                  fmt={(v) => (v > 0 ? String(v) : "")}
                  compact
                />
                <p className="mt-1 text-[11px] text-[var(--color-muted-2)]">
                  Mensagens por dia · últimos 14 dias
                </p>
              </>
            )}
          </Widget>

          {/* Meta + previsão */}
          <Widget
            title="Meta e previsão"
            big={currencyBRL(forecast)}
            sub="previsão: valor em aberto × conversão histórica"
          >
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-xs font-semibold text-[var(--color-muted)]">
                  Meta do mês
                </p>
                <GoalBar
                  month={monthKey}
                  revenue={wonAll
                    .filter((l) => monthOf(l.won_at!) === monthKey)
                    .reduce((a, l) => a + (l.value ?? 0), 0)}
                  target={goalTarget}
                  canEdit={false}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MiniStat
                  label="Em aberto"
                  value={currencyBRL(pipelineValue)}
                />
                <MiniStat
                  label="Conversão histórica"
                  value={`${Math.round(winRate * 100)}%`}
                />
              </div>
            </div>
          </Widget>
        </div>
      </div>
    </div>
  );
}

// ===================== widgets =====================

function Widget({
  title,
  big,
  sub,
  children,
}: {
  title: string;
  big: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <div className="mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          {title}
        </h2>
        <div className="mt-0.5 flex items-baseline gap-2">
          {big && (
            <span className="text-2xl font-bold tabular-nums tracking-tight">
              {big}
            </span>
          )}
          <span className="text-xs text-[var(--color-muted-2)]">{sub}</span>
        </div>
      </div>
      {children}
    </section>
  );
}

function BigNumber({
  title,
  period,
  value,
  sub,
  accent,
  delta,
}: {
  title: string;
  period: string;
  value: string;
  sub: string;
  accent: string;
  /** Comparação com o período anterior (VibeUX 6.11: KPI sempre com referência). */
  delta?: { current: number; previous: number; fmtPrev: string };
}) {
  const pct =
    delta && delta.previous > 0
      ? Math.round(((delta.current - delta.previous) / delta.previous) * 100)
      : null;
  const up = delta ? delta.current >= delta.previous : true;
  return (
    <div className="card relative overflow-hidden p-4">
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: accent }}
      />
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        {title}{" "}
        <span className="font-normal normal-case tracking-normal text-[var(--color-muted-2)]">
          · {period.toLowerCase()}
        </span>
      </p>
      <p
        className="mt-1.5 truncate text-2xl font-bold tabular-nums tracking-tight"
        style={{ color: accent }}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-[var(--color-muted-2)]">{sub}</p>
      {delta && (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium">
          {pct !== null ? (
            <>
              <span
                className={
                  up ? "text-emerald-600" : "text-[var(--color-danger)]"
                }
              >
                {up ? "▲" : "▼"} {Math.abs(pct)}%
              </span>
              <span className="font-normal text-[var(--color-muted-2)]">
                vs período anterior ({delta.fmtPrev})
              </span>
            </>
          ) : (
            <span className="font-normal text-[var(--color-muted-2)]">
              período anterior: {delta.fmtPrev}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

/** Colunas com linhas de grade e rótulo em cima (estilo Pipedrive Insights). */
function Columns({
  data,
  color,
  fmt,
  compact = false,
}: {
  data: { label: string; value: number; highlight?: boolean }[];
  color: string;
  fmt: (v: number) => string;
  compact?: boolean;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const h = compact ? 90 : 150;
  return (
    <div>
      <div className="relative" style={{ height: h }}>
        {/* linhas de grade */}
        {[0, 25, 50, 75].map((p) => (
          <div
            key={p}
            className="absolute inset-x-0 border-t border-[var(--color-border)]/70"
            style={{ top: `${p}%` }}
          />
        ))}
        <div className="absolute inset-x-0 bottom-0 border-t border-[var(--color-border)]" />
        <div className="relative flex h-full items-end gap-[6%] px-1">
          {data.map((d, i) => (
            <div
              key={i}
              className="flex h-full flex-1 flex-col items-center justify-end"
              title={`${d.label}: ${fmt(d.value) || d.value}`}
            >
              {d.value > 0 && !compact && (
                <span className="mb-1 text-[11px] font-bold tabular-nums text-[var(--color-muted)]">
                  {fmt(d.value)}
                </span>
              )}
              <div
                className="w-full rounded-t-md transition-all"
                style={{
                  height: `${(d.value / max) * (compact ? 92 : 78)}%`,
                  minHeight: d.value > 0 ? 3 : 0,
                  backgroundColor: color,
                  // meses anteriores mais claros; o atual (highlight) cheio
                  opacity: d.highlight === false ? 0.45 : 1,
                }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex gap-[6%] px-1">
        {data.map((d, i) => (
          <span
            key={i}
            className="flex-1 truncate text-center text-[11px] capitalize text-[var(--color-muted-2)]"
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Rosca SVG com total no centro. */
function MiniStat({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl bg-[var(--color-surface-2)]/70 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-2)]">
        {label}
      </p>
      <p
        className={`mt-0.5 truncate text-lg font-bold tabular-nums tracking-tight ${
          danger ? "text-[var(--color-danger)]" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-[var(--color-border-strong)] px-4 py-6 text-center text-xs leading-relaxed text-[var(--color-muted-2)]">
      {text}
    </p>
  );
}
