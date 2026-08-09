"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
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

/**
 * Cobrança manual direto daqui (o painel do Asaas dentro do sistema):
 * avulsa = uma cobrança com vencimento; mensal = assinatura recorrente.
 * O link da fatura vai pelo NOSSO WhatsApp.
 */
export async function createManualCharge(form: FormData) {
  const profile = await getProfile();
  const supabase = await createClient();
  if (!(await asaasConfigured()))
    return { error: "Asaas sem chave configurada (ASAAS_API_KEY)." };

  const s = (k: string) => String(form.get(k) ?? "").trim();
  const leadId = s("lead_id");
  const kind = s("kind") === "recorrente" ? "recorrente" : "avulsa";
  const description = s("description");
  const value = Number(s("value").replace(/\./g, "").replace(",", "."));
  const dueDate = s("due_date"); // YYYY-MM-DD
  const cpfCnpj = s("cpf_cnpj").replace(/\D/g, "");

  if (!leadId) return { error: "Escolha o cliente." };
  if (!description) return { error: "Descreva a cobrança." };
  if (!value || value <= 0) return { error: "Informe o valor." };
  if (!dueDate) return { error: "Informe o vencimento." };
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  if (dueDate < hoje) return { error: "O vencimento não pode ser no passado." };

  const { data: lead } = await supabase
    .from("leads")
    .select("id, name, phone, email")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { error: "Cliente não encontrado." };

  // cliente Asaas: reaproveita de vendas anteriores; senão precisa do CPF/CNPJ
  const { data: prevSale } = await supabase
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
      name: lead.name,
      cpfCnpj,
      email: lead.email,
      phone: lead.phone,
      externalReference: lead.id,
    });
    if (!cust.id) return { error: `Asaas: ${cust.error}` };
    customerId = cust.id;
  }

  const admin = createAdminClient();
  const first = lead.name.split(" ")[0];

  if (kind === "avulsa") {
    const { payment, error } = await createPayment({
      customerId,
      value,
      dueDate,
      description,
      externalReference: lead.id,
    });
    if (error || !payment) return { error: `Asaas: ${error}` };

    const { data: sale, error: saleErr } = await supabase
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
        created_by: profile.id,
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
    if (payment.invoiceUrl && lead.phone) {
      const venc = dueDate.split("-").reverse().join("/");
      await admin.from("scheduled_messages").insert({
        lead_id: leadId,
        body: `${first}, sua cobrança "${description}" está disponível — vence em ${venc}. Pague por PIX, boleto ou cartão:\n\n${payment.invoiceUrl}`,
        send_at: new Date().toISOString(),
        status: "pending",
        created_by: null,
      });
    }
    revalidatePath("/vendas");
    return { ok: true, whatsapp: !!(payment.invoiceUrl && lead.phone) };
  }

  // recorrente
  const sub = await createSubscription({
    customerId,
    value,
    nextDueDate: dueDate,
    description,
    externalReference: lead.id,
  });
  if (!sub.id) return { error: `Asaas: ${sub.error}` };

  const { data: sale, error: saleErr } = await supabase
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
      created_by: profile.id,
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
    if (firstPay.invoiceUrl && lead.phone) {
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
  revalidatePath("/vendas");
  return { ok: true, whatsapp: !!(firstPay?.invoiceUrl && lead.phone) };
}

/** Reenvia o link de uma fatura pendente pelo WhatsApp. */
export async function resendChargeLink(salePaymentId: string) {
  await getProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("sale_payments")
    .select("invoice_url, due_date, sale:sales(description, lead:leads(id, name, phone))")
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

  const admin = createAdminClient();
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

/** Cancela uma cobrança PENDENTE (no Asaas e aqui). */
export async function cancelCharge(salePaymentId: string) {
  await getProfile();
  const supabase = await createClient();
  const { data } = await supabase
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
    return { error: "Cobrança paga não pode ser cancelada — só estornada no painel do Asaas." };

  if (row.asaas_payment_id && (await asaasConfigured())) {
    const r = await deletePayment(row.asaas_payment_id);
    const jaSumiu = /not_found|não encontrad|inexistente/i.test(r.error ?? "");
    if (!r.ok && !jaSumiu)
      return { error: `Asaas: ${r.error ?? "falha ao cancelar"}` };
  }

  await supabase
    .from("sale_payments")
    .update({ status: "cancelado" })
    .eq("id", row.id);
  if (row.sale?.kind === "avulsa") {
    await supabase
      .from("sales")
      .update({ status: "encerrada", updated_at: new Date().toISOString() })
      .eq("id", row.sale.id);
  }
  revalidatePath("/vendas");
  return { ok: true };
}

/**
 * Encerra a venda: cancela a assinatura no Asaas (cobranças futuras param)
 * e marca como encerrada aqui. Cobranças já emitidas continuam valendo.
 */
export async function endSale(saleId: string) {
  await getProfile();
  const supabase = await createClient();

  const { data: s } = await supabase
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

  const { error } = await supabase
    .from("sales")
    .update({ status: "encerrada", updated_at: new Date().toISOString() })
    .eq("id", saleId);
  if (error) return { error: error.message };

  revalidatePath("/vendas");
  return { ok: true };
}
