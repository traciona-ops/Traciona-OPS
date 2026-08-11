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

export type Filter = "todos" | "ativa" | "atraso" | "historico";

export type ClientGroup = {
  lead: NonNullable<SaleRow["lead"]>;
  sales: SaleRow[];
  totalPago: number;
  cobrancas: number;
  ultima: string;
  temAssinaturaAtiva: boolean;
  temAtraso: boolean;
};

export type SalesViewProps = {
  sales: SaleRow[];
  payments: PaymentRow[];
  leads: LeadOption[];
  balance: number | null;
  integrationReady: boolean;
};

export const PAY_META: Record<
  PaymentRow["status"],
  { label: string; tone: "success" | "warning" | "danger" | "neutral" }
> = {
  pago: { label: "Pago", tone: "success" },
  pendente: { label: "Pendente", tone: "warning" },
  atrasado: { label: "Atrasado", tone: "danger" },
  estornado: { label: "Estornado", tone: "neutral" },
  cancelado: { label: "Cancelado", tone: "neutral" },
};

export type MonthBar = {
  label: string;
  value: number;
  highlight?: boolean;
};

export type FilterCounts = Record<Filter, number>;

export type SalesKpis = {
  totalPago: number;
  recebidoMes: number;
  recebidoPrev: number;
  prevLabel: string;
  mrr: number;
  atrasado: number;
};
