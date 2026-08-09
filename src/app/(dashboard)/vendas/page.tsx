import { createClient } from "@/lib/supabase/server";
import { asaasConfigured, getBalance } from "@/lib/services/asaas";
import { requireModule } from "@/lib/access";
import {
  SalesView,
  type SaleRow,
  type PaymentRow,
  type LeadOption,
} from "@/components/vendas/sales-view";

export const metadata = { title: "Vendas" };

// Extrato do dinheiro: vendas nascem sozinhas do contrato assinado, cobranças
// manuais nascem daqui, e o Asaas mantém tudo em dia via webhook.
export default async function VendasPage() {
  await requireModule("vendas");
  const supabase = await createClient();
  const [salesRes, paymentsRes, leadsRes, balanceRes] = await Promise.all([
    supabase
      .from("sales")
      .select(
        "id, description, kind, value, billing_day, status, asaas_subscription_id, started_at, created_at, lead:leads(id, code, name, avatar_url, phone)"
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("sale_payments")
      .select("id, sale_id, value, due_date, status, invoice_url, paid_at")
      .order("due_date", { ascending: false })
      .limit(500),
    supabase.from("leads").select("id, name, phone").order("name"),
    asaasConfigured().then((ok) => (ok ? getBalance() : { balance: undefined })),
  ]);

  return (
    <SalesView
      sales={(salesRes.data ?? []) as unknown as SaleRow[]}
      payments={(paymentsRes.data ?? []) as PaymentRow[]}
      leads={(leadsRes.data ?? []) as LeadOption[]}
      balance={
        typeof balanceRes.balance === "number" ? balanceRes.balance : null
      }
      integrationReady={await asaasConfigured()}
    />
  );
}
