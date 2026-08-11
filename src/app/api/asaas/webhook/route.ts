import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AsaasPayment } from "@/lib/services/asaas";
import { applyAsaasPaymentEvent } from "@/lib/vendas/from-asaas-webhook";

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

  const result = await applyAsaasPaymentEvent(createAdminClient(), p);
  if ("sale" in result) {
    return NextResponse.json({ ok: true, sale: "not_found" });
  }
  return NextResponse.json({ ok: true, status: result.status });
}
