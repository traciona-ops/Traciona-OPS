import type { SupabaseClient } from "@supabase/supabase-js";
import {
  asaasConfigured,
  ensureCustomer,
  createSubscription,
  listSubscriptionPayments,
  mapAsaasStatus,
} from "@/lib/asaas";

// Fecha o ciclo do dinheiro: contrato ASSINADO → venda recorrente criada →
// assinatura no Asaas → 1ª fatura no WhatsApp do cliente. Idempotente por
// contrato (nunca cria duas vendas pro mesmo contrato).

type TemplateData = {
  tipo?: "pf" | "pj";
  cpf?: string;
  cnpj?: string;
  contratanteNome?: string;
  email?: string;
  valorMensal?: number;
  diaVencimento?: number;
};

/** Próxima ocorrência do dia de vencimento (nunca no passado). */
function proximoVencimento(dia: number): string {
  const now = new Date(Date.now() - 3 * 3600_000); // BR
  const d = Math.min(Math.max(1, dia || 10), 28);
  const cand = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), d));
  if (cand.getTime() <= now.getTime())
    cand.setUTCMonth(cand.getUTCMonth() + 1);
  return cand.toISOString().slice(0, 10);
}

/**
 * Cria a venda recorrente a partir de um contrato assinado. Retorna
 * silenciosamente quando: Asaas sem chave, contrato sem dados de cobrança
 * ou venda já existente. Nunca lança — quem chama não pode quebrar.
 */
export async function createSaleFromContract(
  admin: SupabaseClient,
  contractId: string
): Promise<{ created: boolean; reason?: string }> {
  try {
    const { data: existing } = await admin
      .from("sales")
      .select("id")
      .eq("contract_id", contractId)
      .limit(1)
      .maybeSingle();
    if (existing) return { created: false, reason: "venda já existe" };

    const { data: c } = await admin
      .from("contracts")
      .select("id, title, value, template_data, lead:leads(id, name, phone, email)")
      .eq("id", contractId)
      .maybeSingle();
    const contract = c as unknown as {
      id: string;
      title: string;
      value: number | null;
      template_data: TemplateData | null;
      lead: { id: string; name: string; phone: string | null; email: string | null } | null;
    } | null;
    if (!contract?.lead) return { created: false, reason: "sem lead" };

    const td = contract.template_data ?? {};
    const valor = Number(td.valorMensal ?? contract.value ?? 0);
    if (!valor || valor <= 0)
      return { created: false, reason: "contrato sem valor mensal" };

    const doc = (td.tipo === "pj" ? td.cnpj : td.cpf)?.replace(/\D/g, "") ?? "";
    const diaVenc = Number(td.diaVencimento ?? 10);

    // Registra a venda mesmo sem Asaas — o extrato existe; a cobrança
    // automática liga quando a chave entrar.
    const { data: sale, error: saleErr } = await admin
      .from("sales")
      .insert({
        lead_id: contract.lead.id,
        contract_id: contract.id,
        description: contract.title,
        kind: "recorrente",
        value: valor,
        billing_day: diaVenc,
        status: "ativa",
        started_at: new Date(Date.now() - 3 * 3600_000)
          .toISOString()
          .slice(0, 10),
      })
      .select("id")
      .single();
    if (saleErr) return { created: false, reason: saleErr.message };

    const asaasOk = await asaasConfigured();
    if (!asaasOk || !doc) {
      return {
        created: true,
        reason: !asaasOk ? "asaas sem chave" : "sem CPF/CNPJ",
      };
    }

    const cust = await ensureCustomer({
      name: td.contratanteNome || contract.lead.name,
      cpfCnpj: doc,
      email: td.email || contract.lead.email,
      phone: contract.lead.phone,
      externalReference: contract.lead.id,
    });
    if (!cust.id) {
      console.log("[sales] Asaas customer falhou:", cust.error);
      return { created: true, reason: cust.error };
    }

    const sub = await createSubscription({
      customerId: cust.id,
      value: valor,
      nextDueDate: proximoVencimento(diaVenc),
      description: contract.title,
      externalReference: contract.id,
    });
    if (!sub.id) {
      console.log("[sales] Asaas subscription falhou:", sub.error);
      return { created: true, reason: sub.error };
    }

    await admin
      .from("sales")
      .update({
        asaas_customer_id: cust.id,
        asaas_subscription_id: sub.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sale.id);

    // 1ª fatura: espelha no extrato e manda o link pelo NOSSO WhatsApp
    const { payments } = await listSubscriptionPayments(sub.id);
    const first = payments?.[0];
    if (first) {
      await admin.from("sale_payments").upsert(
        {
          sale_id: sale.id,
          asaas_payment_id: first.id,
          value: first.value,
          due_date: first.dueDate,
          status: mapAsaasStatus(first.status),
          billing_type: first.billingType,
          invoice_url: first.invoiceUrl,
        },
        { onConflict: "asaas_payment_id" }
      );
      if (first.invoiceUrl && contract.lead.phone) {
        const firstName = contract.lead.name.split(" ")[0];
        const venc = first.dueDate.split("-").reverse().join("/");
        await admin.from("scheduled_messages").insert({
          lead_id: contract.lead.id,
          body: `${firstName}, sua primeira mensalidade já está disponível — vence em ${venc}. Pague por PIX, boleto ou cartão nesse link:\n\n${first.invoiceUrl}\n\nAs próximas chegam automaticamente todo mês.`,
          send_at: new Date().toISOString(),
          status: "pending",
          created_by: null,
        });
      }
    }

    return { created: true };
  } catch (e) {
    console.log("[sales] createSaleFromContract:", (e as Error).message);
    return { created: false, reason: (e as Error).message };
  }
}
