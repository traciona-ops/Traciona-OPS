import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapAsaasStatus, type AsaasPayment } from "@/lib/services/asaas";

// Webhook do Asaas: espelha cobranças no extrato (sale_payments) e agradece
// pelo WhatsApp quando o pagamento cai. Auth: ?secret= na URL cadastrada
// OU header asaas-access-token (token definido ao criar o webhook lá).

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.ASAAS_WEBHOOK_SECRET;
  const given =
    url.searchParams.get("secret") ?? req.headers.get("asaas-access-token");
  if (!secret || given !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = (await req.json().catch(() => ({}))) as {
    event?: string;
    payment?: AsaasPayment;
  };
  const event = String(payload.event ?? "");
  const p = payload.payment;
  if (!event.startsWith("PAYMENT_") || !p?.id) {
    return NextResponse.json({ ok: true, ignored: event });
  }

  const admin = createAdminClient();

  // acha a venda: pela assinatura (recorrente) ou pela cobrança (avulsa)
  let saleId: string | null = null;
  let leadId: string | null = null;
  if (p.subscription) {
    const { data } = await admin
      .from("sales")
      .select("id, lead_id")
      .eq("asaas_subscription_id", p.subscription)
      .maybeSingle();
    saleId = (data as { id: string } | null)?.id ?? null;
    leadId = (data as { lead_id: string } | null)?.lead_id ?? null;
  }
  if (!saleId) {
    const { data } = await admin
      .from("sales")
      .select("id, lead_id")
      .eq("asaas_payment_id", p.id)
      .maybeSingle();
    saleId = (data as { id: string } | null)?.id ?? null;
    leadId = (data as { lead_id: string } | null)?.lead_id ?? null;
  }
  if (!saleId) return NextResponse.json({ ok: true, sale: "not_found" });

  const novoStatus = mapAsaasStatus(p.status);

  // já estava pago? (dedupe do agradecimento)
  const { data: prev } = await admin
    .from("sale_payments")
    .select("status")
    .eq("asaas_payment_id", p.id)
    .maybeSingle();
  const jaPago = (prev as { status: string } | null)?.status === "pago";

  await admin.from("sale_payments").upsert(
    {
      sale_id: saleId,
      asaas_payment_id: p.id,
      value: p.value,
      due_date: p.dueDate,
      status: novoStatus,
      billing_type: p.billingType,
      invoice_url: p.invoiceUrl,
      paid_at:
        novoStatus === "pago"
          ? p.clientPaymentDate ?? p.paymentDate ?? new Date().toISOString()
          : null,
    },
    { onConflict: "asaas_payment_id" }
  );

  // pagamento caiu → agradece pelo NOSSO WhatsApp (1x por cobrança)
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

  return NextResponse.json({ ok: true, status: novoStatus });
}
