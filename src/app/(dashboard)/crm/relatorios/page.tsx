import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, DollarSign, Trophy, TrendingUp } from "lucide-react";
import { CrmHeader } from "@/components/crm/crm-header";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { requireModule } from "@/lib/access";
import { can } from "@/lib/permissions";
import { currencyBRL } from "@/lib/utils";
import { monthBoundsBR } from "@/lib/dates";
import { SOURCE_LABEL, type Lead, type LeadSource, type Pipeline, type PipelineStage } from "@/lib/types";

export const metadata = { title: "Relatórios" };

const PERIODS = [
  { key: "mes", label: "Este mês" },
  { key: "mes_passado", label: "Mês passado" },
  { key: "30d", label: "30 dias" },
  { key: "90d", label: "90 dias" },
  { key: "tudo", label: "Tudo" },
] as const;

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requireModule("crm");
  const profile = await getProfile();
  if (!can.viewReports(profile.role)) redirect("/crm");
  const { period = "mes" } = await searchParams;
  const supabase = await createClient();
  const [leadsRes, pipelinesRes, stagesRes] = await Promise.all([
    supabase
      .from("leads")
      .select("id,stage_id,pipeline_id,source,value,created_at,won_at,lost_at")
      .limit(10000),
    supabase.from("pipelines").select("*").eq("archived", false).order("position"),
    supabase.from("pipeline_stages").select("*"),
  ]);
  type RLead = Pick<
    Lead,
    "id" | "stage_id" | "pipeline_id" | "source" | "value" | "created_at" | "won_at" | "lost_at"
  >;
  const allLeads = (leadsRes.data ?? []) as RLead[];
  const pipelines = (pipelinesRes.data ?? []) as Pipeline[];
  const stages = (stagesRes.data ?? []) as PipelineStage[];

  // KPIs de vendas sem os funis de CS (clientes ativos não são "leads")
  const csIds = new Set(pipelines.filter((p) => p.is_cs).map((p) => p.id));
  const leads = allLeads.filter((l) => !l.pipeline_id || !csIds.has(l.pipeline_id));

  const wonIds = new Set(stages.filter((s) => s.is_won).map((s) => s.id));
  const lostIds = new Set(stages.filter((s) => s.is_lost).map((s) => s.id));

  // ---- Janela do período (fuso BR) ----
  const now = new Date();
  const { monthStart, lastMonthStart } = monthBoundsBR(now);
  let from: Date | null = monthStart;
  let to: Date | null = null;
  if (period === "mes_passado") {
    from = lastMonthStart;
    to = monthStart;
  } else if (period === "30d") from = new Date(now.getTime() - 30 * 864e5);
  else if (period === "90d") from = new Date(now.getTime() - 90 * 864e5);
  else if (period === "tudo") from = null;
  const inPeriod = (iso: string | null) => {
    if (!iso) return false;
    const d = new Date(iso);
    if (from && d < from) return false;
    if (to && d >= to) return false;
    return true;
  };

  const open = leads.filter(
    (l) => l.stage_id && !wonIds.has(l.stage_id) && !lostIds.has(l.stage_id)
  );
  // Ganho = won_at preenchido (data real do fechamento, não updated_at)
  const wonPeriod = allLeads.filter((l) => inPeriod(l.won_at));
  const lostPeriod = leads.filter((l) => inPeriod(l.lost_at));
  const newPeriod = leads.filter((l) => inPeriod(l.created_at));
  const closed = wonPeriod.length + lostPeriod.length;
  const winRate = closed > 0 ? Math.round((wonPeriod.length / closed) * 100) : 0;

  const kpis = [
    { label: "Leads em aberto", value: String(open.length), icon: Users, color: "#1d6fff", sub: `${newPeriod.length} novos no período` },
    { label: "Valor no pipeline", value: currencyBRL(open.reduce((a, l) => a + (l.value ?? 0), 0)), icon: DollarSign, color: "#0091b3", sub: "snapshot atual" },
    { label: "Fechado no período", value: currencyBRL(wonPeriod.reduce((a, l) => a + (l.value ?? 0), 0)), icon: Trophy, color: "#0ca678", sub: `${wonPeriod.length} negócio(s)` },
    { label: "Conversão no período", value: `${winRate}%`, icon: TrendingUp, color: "#d97706", sub: `${wonPeriod.length} de ${closed} fechados` },
  ];

  // Origem: leads CRIADOS no período; % fecham = quantos deles já ganharam
  const srcBase = period === "tudo" ? allLeads : allLeads.filter((l) => inPeriod(l.created_at));
  const bySource = (Object.keys(SOURCE_LABEL) as LeadSource[])
    .map((s) => {
      const ls = srcBase.filter((l) => l.source === s);
      return {
        source: s,
        count: ls.length,
        won: ls.filter((l) => l.won_at).length,
        value: ls.reduce((a, l) => a + (l.value ?? 0), 0),
      };
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  const byPipeline = pipelines.map((p) => {
    const ls = allLeads.filter((l) => l.pipeline_id === p.id);
    return { pipeline: p, count: ls.length, value: ls.reduce((a, l) => a + (l.value ?? 0), 0) };
  });

  // Funil etapa-a-etapa (snapshot de onde os leads estão AGORA)
  const funnels = pipelines
    .filter((p) => !p.is_cs)
    .map((p) => {
      const pStages = stages
        .filter((s) => s.pipeline_id === p.id)
        .sort((a, b) => a.position - b.position)
        .map((s) => {
          const ls = allLeads.filter((l) => l.stage_id === s.id);
          return {
            stage: s,
            count: ls.length,
            value: ls.reduce((a, l) => a + (l.value ?? 0), 0),
          };
        });
      const max = Math.max(1, ...pStages.map((r) => r.count));
      return { pipeline: p, rows: pStages, max };
    })
    .filter((f) => f.rows.some((r) => r.count > 0));

  const maxSource = Math.max(1, ...bySource.map((r) => r.count));

  return (
    <>
      <CrmHeader />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          {/* Período */}
          <div className="flex flex-wrap gap-1.5">
            {PERIODS.map((p) => (
              <Link
                key={p.key}
                href={`/crm/relatorios?period=${p.key}`}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  period === p.key
                    ? "bg-[var(--color-primary)] text-[var(--color-on-accent)]"
                    : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                }`}
              >
                {p.label}
              </Link>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((k) => {
              const Icon = k.icon;
              return (
                <div key={k.label} className="card p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs text-[var(--color-muted)]">{k.label}</span>
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${k.color}18` }}>
                      <Icon className="h-4 w-4" style={{ color: k.color }} />
                    </div>
                  </div>
                  <p className="text-2xl font-semibold tracking-tight">{k.value}</p>
                  {k.sub && (
                    <p className="mt-1 text-xs text-[var(--color-muted-2)]">{k.sub}</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Funil etapa-a-etapa (onde os leads estão agora) */}
          {funnels.map((f) => (
            <section key={f.pipeline.id} className="card p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: f.pipeline.color }}
                />
                Funil · {f.pipeline.name}
              </h2>
              <div className="space-y-2.5">
                {f.rows.map((r) => (
                  <div key={r.stage.id}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: r.stage.color }}
                        />
                        {r.stage.name}
                        {r.stage.is_won && (
                          <span className="text-[11px] font-medium text-[var(--color-success)]">GANHO</span>
                        )}
                        {r.stage.is_lost && (
                          <span className="text-[11px] font-medium text-[var(--color-danger)]">PERDIDO</span>
                        )}
                      </span>
                      <span className="text-[var(--color-muted)]">
                        {r.count}
                        {r.value > 0 && ` · ${currencyBRL(r.value)}`}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--color-surface-2)]">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${(r.count / f.max) * 100}%`,
                          backgroundColor: r.stage.is_lost
                            ? "var(--color-danger)"
                            : r.stage.is_won
                            ? "var(--color-success)"
                            : "var(--color-primary)",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card p-5">
              <h2 className="mb-4 text-sm font-semibold">Leads por origem</h2>
              <div className="space-y-3">
                {bySource.length === 0 && (
                  <p className="text-sm text-[var(--color-muted-2)]">Sem dados.</p>
                )}
                {bySource.map((r) => (
                  <div key={r.source}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span>{SOURCE_LABEL[r.source]}</span>
                      <span className="text-[var(--color-muted)]">
                        {r.count} · {r.won > 0 && (
                          <span className="text-[var(--color-success)]">
                            {Math.round((r.won / r.count) * 100)}% fecham ·{" "}
                          </span>
                        )}
                        {currencyBRL(r.value)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--color-surface-2)]">
                      <div
                        className="h-2 rounded-full bg-[var(--color-primary)]"
                        style={{ width: `${(r.count / maxSource) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="card p-5">
              <h2 className="mb-4 text-sm font-semibold">Leads por pipeline</h2>
              <div className="space-y-2">
                {byPipeline.map((r) => (
                  <div
                    key={r.pipeline.id}
                    className="flex items-center justify-between rounded-lg bg-[var(--color-surface-2)] px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.pipeline.color }} />
                      <span className="text-sm">{r.pipeline.name}</span>
                    </div>
                    <span className="text-sm text-[var(--color-muted)]">
                      {r.count} leads · {currencyBRL(r.value)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
