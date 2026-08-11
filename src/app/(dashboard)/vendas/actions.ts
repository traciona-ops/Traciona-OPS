"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
import {
  cancelChargeDomain,
  createManualChargeDomain,
  endSaleDomain,
  resendChargeLinkDomain,
} from "@/lib/vendas/charges";

type ActionResult = { error?: string; ok?: true; whatsapp?: boolean };

/**
 * Cobrança manual direto daqui (o painel do Asaas dentro do sistema):
 * avulsa = uma cobrança com vencimento; mensal = assinatura recorrente.
 * O link da fatura vai pelo NOSSO WhatsApp.
 */
export async function createManualCharge(
  form: FormData
): Promise<ActionResult> {
  const profile = await getProfile();
  const supabase = await createClient();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const r = await createManualChargeDomain(supabase, createAdminClient(), {
    leadId: s("lead_id"),
    kind: s("kind") === "recorrente" ? "recorrente" : "avulsa",
    description: s("description"),
    value: Number(s("value").replace(/\./g, "").replace(",", ".")),
    dueDate: s("due_date"),
    cpfCnpj: s("cpf_cnpj").replace(/\D/g, ""),
    createdBy: profile.id,
  });
  if ("error" in r) return { error: r.error };
  revalidatePath("/vendas");
  return { ok: true, whatsapp: r.whatsapp };
}

/** Reenvia o link de uma fatura pendente pelo WhatsApp. */
export async function resendChargeLink(
  salePaymentId: string
): Promise<ActionResult> {
  await getProfile();
  const supabase = await createClient();
  const r = await resendChargeLinkDomain(
    supabase,
    createAdminClient(),
    salePaymentId
  );
  if ("error" in r) return { error: r.error };
  return { ok: true };
}

/** Cancela uma cobrança PENDENTE (no Asaas e aqui). */
export async function cancelCharge(
  salePaymentId: string
): Promise<ActionResult> {
  await getProfile();
  const supabase = await createClient();
  const r = await cancelChargeDomain(supabase, salePaymentId);
  if ("error" in r) return { error: r.error };
  revalidatePath("/vendas");
  return { ok: true };
}

/**
 * Encerra a venda: cancela a assinatura no Asaas (cobranças futuras param)
 * e marca como encerrada aqui. Cobranças já emitidas continuam valendo.
 */
export async function endSale(saleId: string): Promise<ActionResult> {
  await getProfile();
  const supabase = await createClient();
  const r = await endSaleDomain(supabase, saleId);
  if ("error" in r) return { error: r.error };
  revalidatePath("/vendas");
  return { ok: true };
}
