import {
  CheckCircle2,
  Landmark,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { currencyBRL } from "@/lib/utils/ui";
import { KpiCard } from "./kpi-card";
import { MonthlyBars } from "./monthly-bars";
import type { MonthBar, SalesKpis } from "./types";

export function SalesKpis({
  kpis,
  balance,
  meses,
}: {
  kpis: SalesKpis;
  balance: number | null;
  meses: MonthBar[];
}) {
  return (
    <>
      <div className="mb-2.5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KpiCard
          icon={Wallet}
          label="Recebido total"
          value={currencyBRL(kpis.totalPago)}
          sub="todo o histórico"
          tone="ok"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Recebido este mês"
          value={currencyBRL(kpis.recebidoMes)}
          tone={kpis.recebidoMes > 0 ? "ok" : "neutral"}
          extra={
            kpis.recebidoPrev > 0 ? (
              <span className="flex items-center gap-1 text-[11px] font-medium">
                <span
                  className={
                    kpis.recebidoMes >= kpis.recebidoPrev
                      ? "text-[var(--color-success)]"
                      : "text-[var(--color-danger)]"
                  }
                >
                  {kpis.recebidoMes >= kpis.recebidoPrev ? "▲" : "▼"}{" "}
                  {Math.abs(
                    Math.round(
                      ((kpis.recebidoMes - kpis.recebidoPrev) /
                        kpis.recebidoPrev) *
                        100
                    )
                  )}
                  %
                </span>
                <span className="font-normal text-[var(--color-muted-2)]">
                  vs {kpis.prevLabel} ({currencyBRL(kpis.recebidoPrev)})
                </span>
              </span>
            ) : (
              <span className="text-[11px] text-[var(--color-muted-2)]">
                {kpis.prevLabel}: {currencyBRL(kpis.recebidoPrev)}
              </span>
            )
          }
        />
        <KpiCard
          icon={TrendingUp}
          label="Receita recorrente"
          value={currencyBRL(kpis.mrr)}
          sub="por mês (MRR)"
          tone="primary"
        />
        <KpiCard
          icon={Landmark}
          label="Saldo no Asaas"
          value={balance != null ? currencyBRL(balance) : "—"}
          sub="disponível na conta"
          tone="neutral"
        />
      </div>

      <div className="card mb-5 rounded-2xl p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-2)]">
          Recebido por mês · últimos 6 meses
        </p>
        <MonthlyBars data={meses} />
      </div>
    </>
  );
}
