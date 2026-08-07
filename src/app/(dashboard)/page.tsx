import Link from "next/link";
import {
  UserPlus,
  FileSignature,
  MessageCircle,
  Handshake,
  SquareCheckBig,
  Clock,
  ClipboardList,
  CheckCircle2,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { currencyBRL } from "@/lib/utils";
import { ymdBR, monthBoundsBR, TZ } from "@/lib/dates";
import { GoalBar } from "@/components/goal-bar";

export const metadata = { title: "Início" };

// Home = Central de Controle (VibeUX 32): atalhos pras ações principais,
// o que precisa de atenção AGORA e a meta do mês — nada de home vazia.
export default async function Home() {
  const profile = await getProfile();
  const supabase = await createClient();

  const now = new Date();
  const brHour = (now.getUTCHours() + 21) % 24;
  const saudacao =
    brHour < 12 ? "Bom dia" : brHour < 18 ? "Boa tarde" : "Boa noite";
  const hoje = now.toLocaleDateString("pt-BR", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const hojeYmd = ymdBR(now);
  const monthKey = hojeYmd.slice(0, 7);
  const { monthStart } = monthBoundsBR(now);

  const [dealsRes, stagesRes, unreadRes, tasksRes, contractsRes, formsRes, wonRes, goalRes] =
    await Promise.all([
      supabase
        .from("leads")
        .select("id, value, stage_id")
        .not("pipeline_id", "is", null)
        .limit(2000),
      supabase.from("pipeline_stages").select("id, is_won, is_lost"),
      supabase
        .from("whatsapp_messages")
        .select("id", { count: "exact", head: true })
        .eq("direction", "in")
        .is("read_at", null),
      supabase.from("lead_tasks").select("done, due_date").limit(2000),
      supabase
        .from("contracts")
        .select("id", { count: "exact", head: true })
        .eq("status", "enviado"),
      supabase
        .from("form_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pendente"),
      supabase
        .from("leads")
        .select("value")
        .gte("won_at", monthStart.toISOString())
        .limit(2000),
      supabase
        .from("org_goals")
        .select("revenue_target")
        .eq("month", monthKey)
        .maybeSingle(),
    ]);

  const stages = (stagesRes.data ?? []) as {
    id: string;
    is_won: boolean;
    is_lost: boolean;
  }[];
  const closedIds = new Set(
    stages.filter((s) => s.is_won || s.is_lost).map((s) => s.id)
  );
  const deals = (dealsRes.data ?? []) as {
    id: string;
    value: number | null;
    stage_id: string | null;
  }[];
  const openDeals = deals.filter(
    (d) => d.stage_id && !closedIds.has(d.stage_id)
  );
  const openValue = openDeals.reduce((a, d) => a + Number(d.value ?? 0), 0);

  const unread = unreadRes.count ?? 0;
  const tasks = (tasksRes.data ?? []) as {
    done: boolean;
    due_date: string | null;
  }[];
  const pendentes = tasks.filter((t) => !t.done);
  const atrasadas = pendentes.filter(
    (t) => t.due_date && t.due_date.slice(0, 10) < hojeYmd
  ).length;
  const aguardandoAssinatura = contractsRes.count ?? 0;
  const formsPendentes = formsRes.count ?? 0;
  const wonMonth = ((wonRes.data ?? []) as { value: number | null }[]).reduce(
    (a, l) => a + Number(l.value ?? 0),
    0
  );
  const goalTarget = Number(
    (goalRes.data as { revenue_target?: number } | null)?.revenue_target ?? 0
  );

  const pendencias = [
    unread > 0 && {
      href: "/chat",
      label: `${unread} mensagem${unread === 1 ? "" : "s"} não lida${
        unread === 1 ? "" : "s"
      } no OPS Chat`,
    },
    atrasadas > 0 && {
      href: "/atividades",
      label: `${atrasadas} tarefa${atrasadas === 1 ? "" : "s"} atrasada${
        atrasadas === 1 ? "" : "s"
      }`,
    },
    aguardandoAssinatura > 0 && {
      href: "/contratos",
      label: `${aguardandoAssinatura} contrato${
        aguardandoAssinatura === 1 ? "" : "s"
      } aguardando assinatura`,
    },
    formsPendentes > 0 && {
      href: "/contratos",
      label: `${formsPendentes} OPS Form${
        formsPendentes === 1 ? "" : "s"
      } aguardando resposta do cliente`,
    },
  ].filter(Boolean) as { href: string; label: string }[];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
        {/* Saudação */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {saudacao}, {profile.name.split(" ")[0]}
          </h1>
          <p className="mt-0.5 text-sm text-[var(--color-muted)]">
            {hoje.charAt(0).toUpperCase() + hoje.slice(1)}
          </p>
        </div>

        {/* Ações rápidas */}
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <QuickAction
            href="/contatos"
            icon={UserPlus}
            title="Novo contato"
            desc="Cadastrar alguém na base"
          />
          <QuickAction
            href="/contratos"
            icon={FileSignature}
            title="Novo contrato"
            desc="OPS Form ou gerar do modelo"
          />
          <QuickAction
            href="/chat"
            icon={MessageCircle}
            title="OPS Chat"
            desc="Conversas do WhatsApp"
            badge={unread}
          />
          <QuickAction
            href="/crm"
            icon={Handshake}
            title="Negócios"
            desc="Funil de vendas"
          />
        </div>

        {/* KPIs do dia */}
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Kpi
            href="/chat"
            icon={MessageCircle}
            label="Não lidas"
            value={String(unread)}
            tone={unread > 0 ? "danger" : "ok"}
          />
          <Kpi
            href="/atividades"
            icon={SquareCheckBig}
            label="Tarefas atrasadas"
            value={String(atrasadas)}
            sub={`${pendentes.length} pendentes no total`}
            tone={atrasadas > 0 ? "warn" : "ok"}
          />
          <Kpi
            href="/contratos"
            icon={Clock}
            label="Aguardando assinatura"
            value={String(aguardandoAssinatura)}
            tone={aguardandoAssinatura > 0 ? "warn" : "ok"}
          />
          <Kpi
            href="/crm"
            icon={Handshake}
            label="Negócios em aberto"
            value={String(openDeals.length)}
            sub={openValue > 0 ? currencyBRL(openValue) : undefined}
            tone="neutral"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Meta do mês */}
          <section className="card p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Meta do mês
            </h2>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-[var(--color-success)]">
              {currencyBRL(wonMonth)}
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-muted-2)]">
              ganhos em negócios este mês
            </p>
            {goalTarget > 0 ? (
              <GoalBar
                month={monthKey}
                revenue={wonMonth}
                target={goalTarget}
                canEdit={false}
              />
            ) : (
              <Link
                href="/dashboards"
                className="mt-2 inline-block text-xs text-[var(--color-primary)] hover:underline"
              >
                Definir a meta do mês nos Dashboards
              </Link>
            )}
          </section>

          {/* Pendências */}
          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              <ClipboardList className="h-3.5 w-3.5" />
              Precisa da sua atenção
            </h2>
            {pendencias.length === 0 ? (
              <div className="flex items-center gap-2.5 rounded-xl bg-[var(--color-success)]/8 px-3.5 py-3 text-sm text-[var(--color-success)]">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Tudo em dia — nenhuma pendência agora.
              </div>
            ) : (
              <ul className="space-y-1">
                {pendencias.map((p) => (
                  <li key={p.label}>
                    <Link
                      href={p.href}
                      className="group flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition hover:bg-[var(--color-surface-2)]"
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-warning)]" />
                      <span className="min-w-0 flex-1">{p.label}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-[var(--color-muted-2)] transition group-hover:text-[var(--color-primary)]" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  title,
  desc,
  badge,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  desc: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="card card-hover relative flex items-center gap-3 rounded-2xl p-3.5"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-[var(--color-muted)]">
          {desc}
        </span>
      </span>
      {badge ? (
        <span className="absolute right-3 top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-danger)] px-1.5 text-[11px] font-bold text-[var(--color-danger-foreground)]">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

function Kpi({
  href,
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone: "ok" | "warn" | "danger" | "neutral";
}) {
  const toneCls =
    tone === "danger"
      ? "text-[var(--color-danger)]"
      : tone === "warn"
      ? "text-[var(--color-warning)]"
      : tone === "ok"
      ? "text-[var(--color-success)]"
      : "text-[var(--color-foreground)]";
  return (
    <Link
      href={href}
      className="card card-hover flex flex-col gap-1.5 rounded-2xl p-3.5"
    >
      <span className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--color-muted)]">
          {label}
        </span>
        <Icon className="h-4 w-4 text-[var(--color-muted-2)]" />
      </span>
      <span className={`text-2xl font-semibold leading-none tabular-nums ${toneCls}`}>
        {value}
      </span>
      {sub && (
        <span className="text-[11px] text-[var(--color-muted-2)]">{sub}</span>
      )}
    </Link>
  );
}
