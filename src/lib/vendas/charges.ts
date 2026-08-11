import type { SupabaseClient } from "@supabase/supabase-js";
import {
  asaasConfigured,
  cancelSubscription,
  ensureCustomer,
  createPayment,
  createSubscription,
  listSubscriptionPayments,
  deletePayment,
  mapAsaasStatus,
} from "@/lib/services/asaas";

export type ManualChargeInput = {
  leadId: string;
  kind: "avulsa" | "recorrente";
  description: string;
  value: number;
  dueDate: string;
  cpfCnpj: string;
  createdBy: string;
};

type LeadRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

/**
 * Cobrança manual: avulsa = uma cobrança; recorrente = assinatura.
 * Espelha sales/sale_payments e agenda link no WhatsApp.
 */
export async function createManualChargeDomain(
  db: SupabaseClient,
  admin: SupabaseClient,
  input: ManualChargeInput
): Promise<{ ok: true; whatsapp: boolean } | { error: string }> {
  if (!(await asaasConfigured()))
    return { error: "Asaas sem chave configurada (ASAAS_API_KEY)." };

  const { leadId, kind, description, value, dueDate, cpfCnpj, createdBy } =
    input;

  if (!leadId) return { error: "Escolha o cliente." };
  if (!description) return { error: "Descreva a cobrança." };
  if (!value || value <= 0) return { error: "Informe o valor." };
  if (!dueDate) return { error: "Informe o vencimento." };
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  if (dueDate < hoje) return { error: "O vencimento não pode ser no passado." };

  const { data: lead } = await db
    .from("leads")
    .select("id, name, phone, email")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { error: "Cliente não encontrado." };
  const l = lead as LeadRow;

  const { data: prevSale } = await db
    .from("sales")
    .select("asaas_customer_id")
    .eq("lead_id", leadId)
    .not("asaas_customer_id", "is", null)
    .limit(1)
    .maybeSingle();
  let customerId = (prevSale as { asaas_customer_id: string } | null)
    ?.asaas_customer_id;
  if (!customerId) {
    if (!cpfCnpj)
      return {
        error:
          "Esse cliente ainda não existe no Asaas — informe o CPF/CNPJ pra criar.",
      };
    const cust = await ensureCustomer({
      name: l.name,
      cpfCnpj,
      email: l.email,
      phone: l.phone,
      externalReference: l.id,
    });
    if (!cust.id) return { error: `Asaas: ${cust.error}` };
    customerId = cust.id;
  }

  const first = l.name.split(" ")[0];

  if (kind === "avulsa") {
    const { payment, error } = await createPayment({
      customerId,
      value,
      dueDate,
      description,
      externalReference: l.id,
    });
    if (error || !payment) return { error: `Asaas: ${error}` };

    const { data: sale, error: saleErr } = await db
      .from("sales")
      .insert({
        lead_id: leadId,
        description,
        kind: "avulsa",
        value,
        status: "ativa",
        asaas_customer_id: customerId,
        asaas_payment_id: payment.id,
        started_at: hoje,
        created_by: createdBy,
      })
      .select("id")
      .single();
    if (saleErr) return { error: saleErr.message };
    await admin.from("sale_payments").upsert(
      {
        sale_id: sale.id,
        asaas_payment_id: payment.id,
        value: payment.value,
        due_date: payment.dueDate,
        status: mapAsaasStatus(payment.status),
        billing_type: payment.billingType,
        invoice_url: payment.invoiceUrl,
      },
      { onConflict: "asaas_payment_id" }
    );
    if (payment.invoiceUrl && l.phone) {
      const venc = dueDate.split("-").reverse().join("/");
      await admin.from("scheduled_messages").insert({
        lead_id: leadId,
        body: `${first}, sua cobrança "${description}" está disponível — vence em ${venc}. Pague por PIX, boleto ou cartão:\n\n${payment.invoiceUrl}`,
        send_at: new Date().toISOString(),
        status: "pending",
        created_by: null,
      });
    }
    return { ok: true, whatsapp: !!(payment.invoiceUrl && l.phone) };
  }

  const sub = await createSubscription({
    customerId,
    value,
    nextDueDate: dueDate,
    description,
    externalReference: l.id,
  });
  if (!sub.id) return { error: `Asaas: ${sub.error}` };

  const { data: sale, error: saleErr } = await db
    .from("sales")
    .insert({
      lead_id: leadId,
      description,
      kind: "recorrente",
      value,
      billing_day: Number(dueDate.slice(8, 10)),
      status: "ativa",
      asaas_customer_id: customerId,
      asaas_subscription_id: sub.id,
      started_at: hoje,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (saleErr) return { error: saleErr.message };

  const { payments } = await listSubscriptionPayments(sub.id);
  const firstPay = payments?.[0];
  if (firstPay) {
    await admin.from("sale_payments").upsert(
      {
        sale_id: sale.id,
        asaas_payment_id: firstPay.id,
        value: firstPay.value,
        due_date: firstPay.dueDate,
        status: mapAsaasStatus(firstPay.status),
        billing_type: firstPay.billingType,
        invoice_url: firstPay.invoiceUrl,
      },
      { onConflict: "asaas_payment_id" }
    );
    if (firstPay.invoiceUrl && l.phone) {
      const venc = firstPay.dueDate.split("-").reverse().join("/");
      await admin.from("scheduled_messages").insert({
        lead_id: leadId,
        body: `${first}, sua mensalidade "${description}" está disponível — vence em ${venc}. Pague por PIX, boleto ou cartão:\n\n${firstPay.invoiceUrl}\n\nAs próximas chegam automaticamente todo mês.`,
        send_at: new Date().toISOString(),
        status: "pending",
        created_by: null,
      });
    }
  }
  return { ok: true, whatsapp: !!(firstPay?.invoiceUrl && l.phone) };
}

export async function resendChargeLinkDomain(
  db: SupabaseClient,
  admin: SupabaseClient,
  salePaymentId: string
): Promise<{ ok: true } | { error: string }> {
  const { data } = await db
    .from("sale_payments")
    .select(
      "invoice_url, due_date, sale:sales(description, lead:leads(id, name, phone))"
    )
    .eq("id", salePaymentId)
    .maybeSingle();
  const row = data as unknown as {
    invoice_url: string | null;
    due_date: string | null;
    sale: {
      description: string;
      lead: { id: string; name: string; phone: string | null } | null;
    } | null;
  } | null;
  if (!row?.invoice_url) return { error: "Essa cobrança não tem link de fatura." };
  if (!row.sale?.lead?.phone)
    return { error: "O cliente não tem WhatsApp cadastrado." };

  const first = row.sale.lead.name.split(" ")[0];
  const venc = row.due_date
    ? row.due_date.slice(0, 10).split("-").reverse().join("/")
    : "";
  await admin.from("scheduled_messages").insert({
    lead_id: row.sale.lead.id,
    body: `${first}, segue a segunda via da cobrança "${row.sale.description}"${venc ? ` (vencimento ${venc})` : ""}:\n\n${row.invoice_url}`,
    send_at: new Date().toISOString(),
    status: "pending",
    created_by: null,
  });
  return { ok: true };
}

export async function cancelChargeDomain(
  db: SupabaseClient,
  salePaymentId: string
): Promise<{ ok: true } | { error: string }> {
  const { data } = await db
    .from("sale_payments")
    .select("id, status, asaas_payment_id, sale:sales(id, kind)")
    .eq("id", salePaymentId)
    .maybeSingle();
  const row = data as unknown as {
    id: string;
    status: string;
    asaas_payment_id: string | null;
    sale: { id: string; kind: string } | null;
  } | null;
  if (!row) return { error: "Cobrança não encontrada." };
  if (row.status === "pago")
    return {
      error:
        "Cobrança paga não pode ser cancelada — só estornada no painel do Asaas.",
    };

  if (row.asaas_payment_id && (await asaasConfigured())) {
    const r = await deletePayment(row.asaas_payment_id);
    const jaSumiu = /not_found|não encontrad|inexistente/i.test(r.error ?? "");
    if (!r.ok && !jaSumiu)
      return { error: `Asaas: ${r.error ?? "falha ao cancelar"}` };
  }

  await db
    .from("sale_payments")
    .update({ status: "cancelado" })
    .eq("id", row.id);
  if (row.sale?.kind === "avulsa") {
    await db
      .from("sales")
      .update({ status: "encerrada", updated_at: new Date().toISOString() })
      .eq("id", row.sale.id);
  }
  return { ok: true };
}

export async function endSaleDomain(
  db: SupabaseClient,
  saleId: string
): Promise<{ ok: true } | { error: string }> {
  const { data: s } = await db
    .from("sales")
    .select("id, status, asaas_subscription_id")
    .eq("id", saleId)
    .maybeSingle();
  if (!s) return { error: "Venda não encontrada." };
  if (s.status !== "ativa") return { error: "Essa venda já está encerrada." };

  if (s.asaas_subscription_id && (await asaasConfigured())) {
    const r = await cancelSubscription(s.asaas_subscription_id as string);
    const jaSumiu = /not_found|não encontrad|inexistente/i.test(r.error ?? "");
    if (!r.ok && !jaSumiu)
      return {
        error: `Não consegui cancelar no Asaas (${r.error ?? "erro"}). A venda não foi encerrada — tenta de novo.`,
      };
  }

  const { error } = await db
    .from("sales")
    .update({ status: "encerrada", updated_at: new Date().toISOString() })
    .eq("id", saleId);
  if (error) return { error: error.message };
  return { ok: true };
}
