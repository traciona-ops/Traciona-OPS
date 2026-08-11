import { useMemo } from "react";
import type {
  ClientGroup,
  Filter,
  FilterCounts,
  MonthBar,
  PaymentRow,
  SaleRow,
  SalesKpis,
} from "./types";

export function useSalesData(sales: SaleRow[], payments: PaymentRow[]) {
  const monthKey = new Date(Date.now() - 3 * 3600_000)
    .toISOString()
    .slice(0, 7);

  const paysBySale = useMemo(() => {
    const m = new Map<string, PaymentRow[]>();
    for (const p of payments) {
      if (!m.has(p.sale_id)) m.set(p.sale_id, []);
      m.get(p.sale_id)!.push(p);
    }
    for (const arr of m.values())
      arr.sort((a, b) => (b.due_date ?? "").localeCompare(a.due_date ?? ""));
    return m;
  }, [payments]);

  const clients = useMemo<ClientGroup[]>(() => {
    const m = new Map<string, ClientGroup>();
    for (const s of sales) {
      if (!s.lead) continue;
      if (!m.has(s.lead.id))
        m.set(s.lead.id, {
          lead: s.lead,
          sales: [],
          totalPago: 0,
          cobrancas: 0,
          ultima: "",
          temAssinaturaAtiva: false,
          temAtraso: false,
        });
      const g = m.get(s.lead.id)!;
      g.sales.push(s);
      if (s.kind === "recorrente" && s.status === "ativa")
        g.temAssinaturaAtiva = true;
      const pays = paysBySale.get(s.id) ?? [];
      for (const p of pays) {
        g.cobrancas++;
        if (p.status === "pago") g.totalPago += Number(p.value ?? 0);
        if (p.status === "atrasado") g.temAtraso = true;
        const ref = p.paid_at ?? p.due_date ?? "";
        if (ref > g.ultima) g.ultima = ref;
      }
      if (pays.length === 0 && (s.started_at ?? "") > g.ultima)
        g.ultima = s.started_at ?? "";
    }
    const peso = (g: ClientGroup) =>
      g.temAtraso ? 0 : g.temAssinaturaAtiva ? 1 : 2;
    return [...m.values()].sort(
      (a, b) => peso(a) - peso(b) || b.ultima.localeCompare(a.ultima)
    );
  }, [sales, paysBySale]);

  const kpis = useMemo<SalesKpis>(() => {
    const totalPago = payments
      .filter((p) => p.status === "pago")
      .reduce((a, p) => a + Number(p.value ?? 0), 0);
    const recebidoMes = payments
      .filter(
        (p) => p.status === "pago" && (p.paid_at ?? "").slice(0, 7) === monthKey
      )
      .reduce((a, p) => a + Number(p.value ?? 0), 0);
    const prev = new Date(`${monthKey}-15T12:00:00-03:00`);
    prev.setMonth(prev.getMonth() - 1);
    const prevKey = prev.toISOString().slice(0, 7);
    const recebidoPrev = payments
      .filter(
        (p) => p.status === "pago" && (p.paid_at ?? "").slice(0, 7) === prevKey
      )
      .reduce((a, p) => a + Number(p.value ?? 0), 0);
    const prevLabel = prev.toLocaleDateString("pt-BR", { month: "short" });
    const mrr = sales
      .filter((s) => s.kind === "recorrente" && s.status === "ativa")
      .reduce((a, s) => a + Number(s.value ?? 0), 0);
    const atrasado = payments
      .filter((p) => p.status === "atrasado")
      .reduce((a, p) => a + Number(p.value ?? 0), 0);
    return { totalPago, recebidoMes, recebidoPrev, prevLabel, mrr, atrasado };
  }, [sales, payments, monthKey]);

  const meses = useMemo<MonthBar[]>(() => {
    const keys: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(`${monthKey}-15T12:00:00-03:00`);
      d.setMonth(d.getMonth() - i);
      keys.push(d.toISOString().slice(0, 7));
    }
    return keys.map((k) => ({
      label: new Date(`${k}-15T12:00:00-03:00`).toLocaleDateString("pt-BR", {
        month: "short",
      }),
      value: payments
        .filter(
          (p) => p.status === "pago" && (p.paid_at ?? "").slice(0, 7) === k
        )
        .reduce((a, p) => a + Number(p.value ?? 0), 0),
      highlight: k === monthKey,
    }));
  }, [payments, monthKey]);

  const counts = useMemo<FilterCounts>(
    () => ({
      todos: clients.length,
      atraso: clients.filter((g) => g.temAtraso).length,
      ativa: clients.filter((g) => g.temAssinaturaAtiva && !g.temAtraso).length,
      historico: clients.filter(
        (g) => !g.temAtraso && !g.temAssinaturaAtiva
      ).length,
    }),
    [clients]
  );

  return { paysBySale, clients, kpis, meses, counts };
}

export function useFilteredClients(
  clients: ClientGroup[],
  filter: Filter,
  q: string
) {
  return useMemo(() => {
    const norm = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(new RegExp("[\\u0300-\\u036f]", "g"), "");
    const query = norm(q.trim());
    return clients.filter((g) => {
      if (filter === "atraso" && !g.temAtraso) return false;
      if (filter === "ativa" && !(g.temAssinaturaAtiva && !g.temAtraso))
        return false;
      if (
        filter === "historico" &&
        (g.temAtraso || g.temAssinaturaAtiva)
      )
        return false;
      if (query && !norm(g.lead.name).includes(query)) return false;
      return true;
    });
  }, [clients, filter, q]);
}
