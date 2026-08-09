"use client";

import { useMemo, useState, useTransition } from "react";
import {
  HandCoins,
  Repeat,
  Link2,
  Ban,
  TrendingUp,
  CheckCircle2,
  Wallet,
  Search,
  ChevronDown,
  Plus,
  X,
  Send,
  Trash2,
  Landmark,
  type LucideIcon,
} from "lucide-react";
import { useRef } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, currencyBRL } from "@/lib/utils/ui";
import { maskCpf, maskCnpj } from "@/lib/utils/masks";
import { toast } from "@/components/ui/toast";
import {
  endSale,
  createManualCharge,
  resendChargeLink,
  cancelCharge,
} from "@/app/(dashboard)/vendas/actions";

export type LeadOption = { id: string; name: string; phone: string | null };

export type SaleRow = {
  id: string;
  description: string;
  kind: "recorrente" | "avulsa";
  value: number;
  billing_day: number | null;
  status: "ativa" | "encerrada" | "cancelada";
  asaas_subscription_id: string | null;
  started_at: string | null;
  created_at: string;
  lead: {
    id: string;
    code: number | null;
    name: string;
    avatar_url: string | null;
    phone: string | null;
  } | null;
};

export type PaymentRow = {
  id: string;
  sale_id: string;
  value: number | null;
  due_date: string | null;
  status: "pendente" | "pago" | "atrasado" | "estornado" | "cancelado";
  invoice_url: string | null;
  paid_at: string | null;
};

const PAY_META: Record<
  PaymentRow["status"],
  { label: string; tone: "success" | "warning" | "danger" | "neutral" }
> = {
  pago: { label: "Pago", tone: "success" },
  pendente: { label: "Pendente", tone: "warning" },
  atrasado: { label: "Atrasado", tone: "danger" },
  estornado: { label: "Estornado", tone: "neutral" },
  cancelado: { label: "Cancelado", tone: "neutral" },
};

const dt = (s: string | null) =>
  s ? s.slice(0, 10).split("-").reverse().join("/") : "—";

export function SalesView({
  sales,
  payments,
  leads,
  balance,
  integrationReady,
}: {
  sales: SaleRow[];
  payments: PaymentRow[];
  leads: LeadOption[];
  balance: number | null;
  integrationReady: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [openClient, setOpenClient] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<"avulsa" | "recorrente">("avulsa");
  const [filter, setFilter] = useState<
    "todos" | "ativa" | "atraso" | "historico"
  >("todos");
  const [q, setQ] = useState("");
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  async function submitCharge(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.set("kind", kind);
    setBusy("new");
    const r = await createManualCharge(form);
    setBusy(null);
    if (r?.error) {
      toast(r.error, { type: "error" });
      return;
    }
    formRef.current?.reset();
    setShowForm(false);
    toast(
      r.whatsapp
        ? "Cobrança criada no Asaas e link enviado no WhatsApp do cliente."
        : "Cobrança criada no Asaas."
    );
  }

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

  // ---------- agrupamento por CLIENTE ----------
  type ClientGroup = {
    lead: NonNullable<SaleRow["lead"]>;
    sales: SaleRow[];
    totalPago: number;
    cobrancas: number;
    ultima: string;
    temAssinaturaAtiva: boolean;
    temAtraso: boolean;
  };

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
    // relevância primeiro: atraso > assinatura ativa > histórico
    const peso = (g: ClientGroup) =>
      g.temAtraso ? 0 : g.temAssinaturaAtiva ? 1 : 2;
    return [...m.values()].sort(
      (a, b) => peso(a) - peso(b) || b.ultima.localeCompare(a.ultima)
    );
  }, [sales, paysBySale]);

  const filteredClients = useMemo(() => {
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

  const kpis = useMemo(() => {
    const totalPago = payments
      .filter((p) => p.status === "pago")
      .reduce((a, p) => a + Number(p.value ?? 0), 0);
    const recebidoMes = payments
      .filter(
        (p) => p.status === "pago" && (p.paid_at ?? "").slice(0, 7) === monthKey
      )
      .reduce((a, p) => a + Number(p.value ?? 0), 0);
    // comparação com o mês anterior (VibeUX 6.11)
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

  // recebido por mês — últimos 6 meses
  const meses = useMemo(() => {
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

  const counts = useMemo(
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

  function encerrar(s: SaleRow) {
    if (
      !confirm(
        `Encerrar "${s.description}"?\n\nAs cobranças futuras no Asaas serão canceladas. As já emitidas continuam valendo.`
      )
    )
      return;
    setBusy(s.id);
    startTransition(async () => {
      const r = await endSale(s.id);
      setBusy(null);
      if (r?.error) toast(r.error, { type: "error" });
      else toast("Venda encerrada — cobranças futuras canceladas.");
    });
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              <HandCoins className="h-5 w-5 text-[var(--color-primary)]" />
              Vendas
            </h1>
            <p className="mt-0.5 text-xs text-[var(--color-muted-2)]">
              Receita por cliente — cobranças sincronizadas com o Asaas
            </p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className={cn(
              "ml-auto flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-medium transition",
              showForm
                ? "border border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
                : "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-sm hover:opacity-90"
            )}
          >
            {showForm ? (
              <>
                <X className="h-4 w-4" />
                Fechar
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Nova cobrança
              </>
            )}
          </button>
        </div>

        {/* KPIs com contexto */}
        <div className="mb-2.5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Kpi
            icon={Wallet}
            label="Recebido total"
            value={currencyBRL(kpis.totalPago)}
            sub="todo o histórico"
            tone="ok"
          />
          <Kpi
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
          <Kpi
            icon={TrendingUp}
            label="Receita recorrente"
            value={currencyBRL(kpis.mrr)}
            sub="por mês (MRR)"
            tone="primary"
          />
          <Kpi
            icon={Landmark}
            label="Saldo no Asaas"
            value={balance != null ? currencyBRL(balance) : "—"}
            sub="disponível na conta"
            tone="neutral"
          />
        </div>

        {/* Recebido por mês */}
        <div className="card mb-5 rounded-2xl p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-2)]">
            Recebido por mês · últimos 6 meses
          </p>
          <Bars data={meses} />
        </div>

        {/* Filtros (tiles clicáveis) + busca */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(
            [
              { key: "todos", label: "Todos" },
              { key: "ativa", label: "Assinatura ativa" },
              {
                key: "atraso",
                label:
                  kpis.atrasado > 0
                    ? `Em atraso · ${currencyBRL(kpis.atrasado)}`
                    : "Em atraso",
              },
              { key: "historico", label: "Histórico" },
            ] as { key: typeof filter; label: string }[]
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors",
                filter === t.key
                  ? "border-transparent bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                  : t.key === "atraso" && counts.atraso > 0
                  ? "border-[var(--color-danger)]/40 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/8"
                  : "border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
              )}
            >
              {t.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] font-semibold",
                  filter === t.key
                    ? "bg-[color-mix(in_srgb,var(--color-primary-foreground)_25%,transparent)]"
                    : "bg-[var(--color-surface-2)] text-[var(--color-muted-2)]"
                )}
              >
                {counts[t.key]}
              </span>
            </button>
          ))}
          <div className="relative ml-auto min-w-0 basis-52">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-2)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar cliente..."
              className="h-9 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 text-sm outline-none transition focus:border-[var(--color-primary)]"
            />
          </div>
        </div>

        {/* Nova cobrança (o painel do Asaas aqui dentro) */}
        {showForm && (
          <form
            ref={formRef}
            onSubmit={submitCharge}
            className="card mb-5 rounded-2xl p-4"
          >
            <div className="mb-4 flex gap-2">
              <button
                type="button"
                onClick={() => setKind("avulsa")}
                className={cn(
                  "h-8 rounded-full px-3.5 text-xs font-medium transition-colors",
                  kind === "avulsa"
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                    : "border border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
                )}
              >
                Cobrança avulsa
              </button>
              <button
                type="button"
                onClick={() => setKind("recorrente")}
                className={cn(
                  "h-8 rounded-full px-3.5 text-xs font-medium transition-colors",
                  kind === "recorrente"
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                    : "border border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
                )}
              >
                Assinatura mensal
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--color-muted)]">
                Cliente *
                <select
                  name="lead_id"
                  required
                  className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]"
                >
                  <option value="">Escolha o cliente...</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--color-muted)]">
                Descrição *
                <input
                  name="description"
                  required
                  placeholder={
                    kind === "recorrente"
                      ? "Ex.: Assessoria de Marketing"
                      : "Ex.: Criação de landing page"
                  }
                  className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--color-muted)]">
                Valor (R$) * {kind === "recorrente" ? "por mês" : ""}
                <input
                  name="value"
                  required
                  inputMode="decimal"
                  placeholder="1500,00"
                  className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--color-muted)]">
                {kind === "recorrente"
                  ? "Primeiro vencimento * (as próximas vêm nesse dia)"
                  : "Vencimento *"}
                <input
                  name="due_date"
                  required
                  type="date"
                  className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--color-muted)] sm:col-span-2">
                CPF/CNPJ (só se o cliente ainda não estiver no Asaas)
                <input
                  name="cpf_cnpj"
                  inputMode="numeric"
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                  onChange={(e) => {
                    const d = e.currentTarget.value.replace(/\D/g, "");
                    e.currentTarget.value =
                      d.length > 11
                        ? maskCnpj(e.currentTarget.value)
                        : maskCpf(e.currentTarget.value);
                  }}
                  className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]"
                />
              </label>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2.5 border-t border-[var(--color-border)] pt-4">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="h-10 px-3 text-sm text-[var(--color-muted)] transition hover:text-[var(--color-foreground)]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy === "new" || !integrationReady}
                className="flex h-10 items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-5 text-sm font-medium text-[var(--color-primary-foreground)] shadow-sm transition hover:opacity-90 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {busy === "new"
                  ? "Criando no Asaas..."
                  : "Criar e enviar no WhatsApp"}
              </button>
            </div>
          </form>
        )}

        {!integrationReady && (
          <div className="mb-5 rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-4 py-3 text-sm text-[var(--color-warning)]">
            <strong>Asaas aguardando chave.</strong> As vendas registram
            normalmente; a cobrança automática ativa quando a ASAAS_API_KEY for
            configurada.
          </div>
        )}

        {/* Clientes */}
        {filteredClients.length === 0 && clients.length > 0 ? (
          <div className="card flex flex-col items-center gap-2 rounded-2xl p-10 text-center">
            <HandCoins className="h-8 w-8 text-[var(--color-muted-2)]" />
            <p className="text-sm text-[var(--color-muted)]">
              {q
                ? "Nenhum cliente encontrado pra essa busca."
                : "Nenhum cliente nesse filtro."}
            </p>
          </div>
        ) : clients.length === 0 ? (
          <div className="card flex flex-col items-center gap-3 rounded-2xl p-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <HandCoins className="h-7 w-7" />
            </div>
            <p className="text-sm font-medium">Nenhuma venda ainda</p>
            <p className="max-w-md text-sm text-[var(--color-muted)]">
              Quando um contrato for assinado, a venda aparece aqui sozinha —
              com a assinatura recorrente criada no Asaas e a primeira fatura
              enviada no WhatsApp do cliente.
            </p>
          </div>
        ) : (
          <div className="card overflow-hidden rounded-2xl">
            {filteredClients.map((g) => {
              const aberto = openClient === g.lead.id;
              return (
                <div
                  key={g.lead.id}
                  className="border-b border-[var(--color-border)] last:border-0"
                >
                  {/* Linha do cliente */}
                  <div
                    onClick={() => setOpenClient(aberto ? null : g.lead.id)}
                    className={cn(
                      "flex cursor-pointer flex-wrap items-center gap-3 p-3.5 transition hover:bg-[var(--color-surface-2)]/40",
                      aberto && "bg-[var(--color-surface-2)]/40"
                    )}
                  >
                    <Avatar
                      name={g.lead.name}
                      src={g.lead.avatar_url}
                      size={42}
                    />
                    <div className="min-w-0 flex-1 basis-52">
                      <p className="truncate text-sm font-semibold">
                        {g.lead.name}
                      </p>
                      <p className="truncate text-xs text-[var(--color-muted)]">
                        {g.cobrancas} cobrança{g.cobrancas === 1 ? "" : "s"}
                        {g.ultima && ` · última em ${dt(g.ultima)}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-[var(--color-success)]">
                        {currencyBRL(g.totalPago)}
                      </p>
                      <p className="text-[11px] text-[var(--color-muted-2)]">
                        recebido
                      </p>
                    </div>
                    {g.temAtraso ? (
                      <Badge tone="danger">Em atraso</Badge>
                    ) : g.temAssinaturaAtiva ? (
                      <Badge tone="success">Assinatura ativa</Badge>
                    ) : (
                      <Badge tone="neutral">Histórico</Badge>
                    )}
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-[var(--color-muted-2)] transition-transform",
                        aberto && "rotate-180"
                      )}
                    />
                  </div>

                  {/* Extrato do cliente */}
                  {aberto && (
                    <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/30 px-4 py-2">
                      {g.sales.map((s) => {
                        const pays = paysBySale.get(s.id) ?? [];
                        const pagas = pays.filter(
                          (p) => p.status === "pago"
                        ).length;
                        const proxima = [...pays]
                          .reverse()
                          .find(
                            (p) =>
                              p.status === "pendente" ||
                              p.status === "atrasado"
                          );
                        const unica = pays.length === 1 ? pays[0] : null;
                        const fatura =
                          proxima?.invoice_url ??
                          pays.find((p) => p.invoice_url)?.invoice_url;
                        return (
                          <div
                            key={s.id}
                            className="flex flex-wrap items-center gap-2.5 border-b border-[var(--color-border)]/60 py-2.5 text-sm last:border-0"
                          >
                            {s.kind === "recorrente" ? (
                              <span
                                title="Assinatura mensal"
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                              >
                                <Repeat className="h-3.5 w-3.5" />
                              </span>
                            ) : (
                              <span
                                title="Cobrança avulsa"
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-2)] text-[var(--color-muted)]"
                              >
                                <HandCoins className="h-3.5 w-3.5" />
                              </span>
                            )}
                            <div className="min-w-0 flex-1 basis-48">
                              <p className="truncate font-medium">
                                {s.description}
                              </p>
                              <p className="text-[11px] text-[var(--color-muted-2)]">
                                {s.kind === "recorrente"
                                  ? `mensal · dia ${s.billing_day ?? "—"} · ${pagas}/${pays.length} pagas${
                                      s.status !== "ativa" ? " · encerrada" : ""
                                    }`
                                  : unica
                                  ? unica.status === "pago"
                                    ? `paga em ${dt(unica.paid_at)}`
                                    : `vence ${dt(unica.due_date)}`
                                  : dt(s.started_at)}
                              </p>
                            </div>
                            <span className="font-semibold tabular-nums">
                              {currencyBRL(Number(s.value))}
                              {s.kind === "recorrente" && (
                                <span className="text-xs font-normal text-[var(--color-muted-2)]">
                                  /mês
                                </span>
                              )}
                            </span>
                            {(() => {
                              const st = unica
                                ? unica.status
                                : proxima
                                ? proxima.status
                                : pagas === pays.length && pays.length > 0
                                ? "pago"
                                : null;
                              if (!st) return null;
                              const meta = PAY_META[st];
                              return (
                                <Badge tone={meta.tone} size="sm">
                                  {meta.label}
                                </Badge>
                              );
                            })()}
                            <div className="flex items-center gap-1">
                              {fatura && (
                                <button
                                  title="Copiar link da fatura"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(fatura);
                                    toast("Link da fatura copiado.");
                                  }}
                                  className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)]"
                                >
                                  <Link2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {(() => {
                                const pendente = unica ?? proxima;
                                if (
                                  !pendente ||
                                  (pendente.status !== "pendente" &&
                                    pendente.status !== "atrasado")
                                )
                                  return null;
                                return (
                                  <>
                                    <button
                                      title="Reenviar fatura pelo WhatsApp"
                                      disabled={busy === pendente.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setBusy(pendente.id);
                                        startTransition(async () => {
                                          const r = await resendChargeLink(
                                            pendente.id
                                          );
                                          setBusy(null);
                                          if (r?.error)
                                            toast(r.error, { type: "error" });
                                          else
                                            toast(
                                              "Segunda via enviada no WhatsApp."
                                            );
                                        });
                                      }}
                                      className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)] disabled:opacity-40"
                                    >
                                      <Send className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      title="Cancelar cobrança (no Asaas também)"
                                      disabled={busy === pendente.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (
                                          !confirm(
                                            `Cancelar a cobrança de ${currencyBRL(
                                              Number(pendente.value ?? 0)
                                            )} (vence ${dt(
                                              pendente.due_date
                                            )})?\n\nEla será excluída no Asaas e o link para de funcionar.`
                                          )
                                        )
                                          return;
                                        setBusy(pendente.id);
                                        startTransition(async () => {
                                          const r = await cancelCharge(
                                            pendente.id
                                          );
                                          setBusy(null);
                                          if (r?.error)
                                            toast(r.error, { type: "error" });
                                          else
                                            toast(
                                              "Cobrança cancelada aqui e no Asaas."
                                            );
                                        });
                                      }}
                                      className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)] disabled:opacity-40"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                );
                              })()}
                              {s.kind === "recorrente" &&
                                s.status === "ativa" && (
                                  <button
                                    title="Encerrar assinatura"
                                    disabled={busy === s.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      encerrar(s);
                                    }}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)] disabled:opacity-40"
                                  >
                                    <Ban className="h-3.5 w-3.5" />
                                  </button>
                                )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone = "neutral",
  extra,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "danger" | "primary" | "neutral";
  extra?: React.ReactNode;
}) {
  const cls =
    tone === "danger"
      ? "text-[var(--color-danger)]"
      : tone === "ok"
      ? "text-[var(--color-success)]"
      : tone === "primary"
      ? "text-[var(--color-primary)]"
      : "text-[var(--color-foreground)]";
  return (
    <div className="card flex flex-col gap-1.5 rounded-2xl p-3.5">
      <span className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--color-muted)]">
          {label}
        </span>
        <Icon className="h-4 w-4 text-[var(--color-muted-2)]" />
      </span>
      <span
        className={cn(
          "truncate text-xl font-semibold tabular-nums leading-none",
          cls
        )}
      >
        {value}
      </span>
      {sub && (
        <span className="text-[11px] text-[var(--color-muted-2)]">{sub}</span>
      )}
      {extra}
    </div>
  );
}

/** Barras mensais no estilo do Dashboard (grade + rótulo em cima). */
function Bars({
  data,
}: {
  data: { label: string; value: number; highlight?: boolean }[];
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const fmt = (v: number) =>
    v >= 1000
      ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(".", ",")}k`
      : String(Math.round(v));
  return (
    <div>
      <div className="relative" style={{ height: 110 }}>
        {[0, 25, 50, 75].map((p) => (
          <div
            key={p}
            className="absolute inset-x-0 border-t border-[var(--color-border)]/70"
            style={{ top: `${p}%` }}
          />
        ))}
        <div className="absolute inset-x-0 bottom-0 border-t border-[var(--color-border)]" />
        <div className="relative flex h-full items-end gap-[5%] px-1">
          {data.map((d, i) => (
            <div
              key={i}
              className="flex h-full flex-1 flex-col items-center justify-end"
              title={`${d.label}: ${currencyBRL(d.value)}`}
            >
              {d.value > 0 && (
                <span className="mb-1 text-[11px] font-bold tabular-nums text-[var(--color-muted)]">
                  {fmt(d.value)}
                </span>
              )}
              <div
                className="w-full max-w-12 rounded-t-md"
                style={{
                  height: `${Math.max(d.value > 0 ? 4 : 0, (d.value / max) * 78)}%`,
                  backgroundColor: d.highlight
                    ? "var(--color-primary)"
                    : "color-mix(in srgb, var(--color-primary) 45%, transparent)",
                }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex gap-[5%] px-1">
        {data.map((d, i) => (
          <span
            key={i}
            className="flex-1 text-center text-[11px] capitalize text-[var(--color-muted-2)]"
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
