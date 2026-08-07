// Integração Asaas (cobranças e assinaturas) — API REST v3.
// Docs: docs.asaas.com. Auth: header `access_token`.
// Sandbox por padrão (não gera cobrança real) — produção via ASAAS_API_URL.

import { getIntegrationSecret } from "@/lib/integrations";

// chave: Configurações → Integrações (banco) primeiro; .env de reserva
async function creds(): Promise<{ key?: string; base: string }> {
  const db = await getIntegrationSecret("asaas");
  const key = db.apiKey?.trim() || process.env.ASAAS_API_KEY?.trim();
  const base = (
    db.apiUrl?.trim() ||
    process.env.ASAAS_API_URL ||
    "https://api.asaas.com/v3"
  ).replace(/\/+$/, "");
  return { key, base };
}

export async function asaasConfigured(): Promise<boolean> {
  const { key } = await creds();
  return !!key;
}

async function req<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>
): Promise<{ data?: T; error?: string }> {
  const { key: KEY, base: BASE } = await creds();
  if (!KEY) return { error: "Asaas não configurado (ASAAS_API_KEY)." };
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        access_token: KEY,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const desc =
        json?.errors?.[0]?.description ?? `Asaas HTTP ${res.status}`;
      return { error: String(desc) };
    }
    return { data: json as T };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * Garante o cliente no Asaas (busca por CPF/CNPJ; cria se não existir).
 */
export async function ensureCustomer(input: {
  name: string;
  cpfCnpj: string;
  email?: string | null;
  phone?: string | null;
  externalReference?: string;
}): Promise<{ id?: string; error?: string }> {
  const doc = input.cpfCnpj.replace(/\D/g, "");
  if (!doc) return { error: "CPF/CNPJ obrigatório pra cobrar no Asaas." };

  const found = await req<{ data?: { id: string }[] }>(
    "GET",
    `/customers?cpfCnpj=${doc}&limit=1`
  );
  if (found.error) return { error: found.error };
  if (found.data?.data?.[0]?.id) return { id: found.data.data[0].id };

  const created = await req<{ id: string }>("POST", "/customers", {
    name: input.name,
    cpfCnpj: doc,
    email: input.email || undefined,
    mobilePhone: input.phone?.replace(/\D/g, "").slice(-11) || undefined,
    externalReference: input.externalReference,
    notificationDisabled: false,
  });
  if (created.error) return { error: created.error };
  return { id: created.data!.id };
}

/**
 * Assinatura mensal. billingType UNDEFINED = o cliente escolhe PIX,
 * boleto ou cartão na própria fatura (melhor conversão).
 */
export async function createSubscription(input: {
  customerId: string;
  value: number;
  nextDueDate: string; // YYYY-MM-DD
  description: string;
  externalReference?: string;
}): Promise<{ id?: string; error?: string }> {
  const r = await req<{ id: string }>("POST", "/subscriptions", {
    customer: input.customerId,
    billingType: "UNDEFINED",
    value: input.value,
    nextDueDate: input.nextDueDate,
    cycle: "MONTHLY",
    description: input.description.slice(0, 500),
    externalReference: input.externalReference,
  });
  if (r.error) return { error: r.error };
  return { id: r.data!.id };
}

export type AsaasPayment = {
  id: string;
  value: number;
  dueDate: string;
  status: string;
  billingType: string;
  invoiceUrl: string | null;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  subscription?: string | null;
};

/** Cobranças de uma assinatura (a 1ª nasce junto com ela). */
export async function listSubscriptionPayments(
  subscriptionId: string
): Promise<{ payments?: AsaasPayment[]; error?: string }> {
  const r = await req<{ data?: AsaasPayment[] }>(
    "GET",
    `/subscriptions/${subscriptionId}/payments?limit=100`
  );
  if (r.error) return { error: r.error };
  return { payments: r.data?.data ?? [] };
}

/** Cobrança avulsa. */
export async function createPayment(input: {
  customerId: string;
  value: number;
  dueDate: string;
  description: string;
  externalReference?: string;
}): Promise<{ payment?: AsaasPayment; error?: string }> {
  const r = await req<AsaasPayment>("POST", "/payments", {
    customer: input.customerId,
    billingType: "UNDEFINED",
    value: input.value,
    dueDate: input.dueDate,
    description: input.description.slice(0, 500),
    externalReference: input.externalReference,
  });
  if (r.error) return { error: r.error };
  return { payment: r.data };
}

/** Cancela a assinatura no Asaas (cobranças futuras param). */
export async function cancelSubscription(
  subscriptionId: string
): Promise<{ ok: boolean; error?: string }> {
  const r = await req<{ deleted?: boolean }>(
    "DELETE",
    `/subscriptions/${subscriptionId}`
  );
  if (r.error) return { ok: false, error: r.error };
  return { ok: true };
}

/** Exclui uma cobrança pendente no Asaas (paga não pode). */
export async function deletePayment(
  paymentId: string
): Promise<{ ok: boolean; error?: string }> {
  const r = await req<{ deleted?: boolean }>(
    "DELETE",
    `/payments/${paymentId}`
  );
  if (r.error) return { ok: false, error: r.error };
  return { ok: true };
}

/** Saldo atual da conta Asaas. */
export async function getBalance(): Promise<{
  balance?: number;
  error?: string;
}> {
  const r = await req<{ balance?: number }>("GET", "/finance/balance");
  if (r.error) return { error: r.error };
  return { balance: Number(r.data?.balance ?? 0) };
}

/** Status do Asaas → status interno da parcela. */
export function mapAsaasStatus(s: string): string {
  const t = (s ?? "").toUpperCase();
  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(t)) return "pago";
  if (t === "OVERDUE") return "atrasado";
  if (["REFUNDED", "REFUND_REQUESTED", "REFUND_IN_PROGRESS", "CHARGEBACK_REQUESTED"].includes(t))
    return "estornado";
  if (["DELETED", "CANCELED"].includes(t)) return "cancelado";
  return "pendente";
}
