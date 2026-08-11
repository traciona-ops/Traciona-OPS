import type { SupabaseClient } from "@supabase/supabase-js";
import { mapAsaasStatus, type AsaasPayment } from "@/lib/services/asaas";

/**
 * Espelha cobrança Asaas em sale_payments e, na 1ª transição pra pago,
 * agenda agradecimento no WhatsApp.
 */
export async function applyAsaasPaymentEvent(
  admin: SupabaseClient,
  payment: AsaasPayment
): Promise<{ status: string } | { sale: "not_found" }> {
  let saleId: string | null = null;
  let leadId: string | null = null;
  if (payment.subscription) {
    const { data } = await admin
      .from("sales")
      .select("id, lead_id")
      .eq("asaas_subscription_id", payment.subscription)
      .maybeSingle();
    saleId = (data as { id: string } | null)?.id ?? null;
    leadId = (data as { lead_id: string } | null)?.lead_id ?? null;
  }
  if (!saleId) {
    const { data } = await admin
      .from("sales")
      .select("id, lead_id")
      .eq("asaas_payment_id", payment.id)
      .maybeSingle();
    saleId = (data as { id: string } | null)?.id ?? null;
    leadId = (data as { lead_id: string } | null)?.lead_id ?? null;
  }
  if (!saleId) return { sale: "not_found" };

  const novoStatus = mapAsaasStatus(payment.status);

  const { data: prev } = await admin
    .from("sale_payments")
    .select("status")
    .eq("asaas_payment_id", payment.id)
    .maybeSingle();
  const jaPago = (prev as { status: string } | null)?.status === "pago";

  await admin.from("sale_payments").upsert(
    {
      sale_id: saleId,
      asaas_payment_id: payment.id,
      value: payment.value,
      due_date: payment.dueDate,
      status: novoStatus,
      billing_type: payment.billingType,
      invoice_url: payment.invoiceUrl,
      paid_at:
        novoStatus === "pago"
          ? payment.clientPaymentDate ??
            payment.paymentDate ??
            new Date().toISOString()
          : null,
    },
    { onConflict: "asaas_payment_id" }
  );

  if (novoStatus === "pago" && !jaPago && leadId) {
    const { data: lead } = await admin
      .from("leads")
      .select("name, phone")
      .eq("id", leadId)
      .maybeSingle();
    const l = lead as { name: string; phone: string | null } | null;
    if (l?.phone) {
      const first = l.name.split(" ")[0];
      await admin.from("scheduled_messages").insert({
        lead_id: leadId,
        body: `Pagamento confirmado, ${first}! Recebemos a sua mensalidade. Obrigado pela parceria.`,
        send_at: new Date().toISOString(),
        status: "pending",
        created_by: null,
      });
    }
  }

  return { status: novoStatus };
}
