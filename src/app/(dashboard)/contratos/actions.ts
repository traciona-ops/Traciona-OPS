"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
import {
  closeContractDomain,
  createContractDomain,
  getContractPdfUrlDomain,
} from "@/lib/contratos/create";
import {
  parseCreateContractForm,
  parseGenerateFromTemplateForm,
} from "@/lib/contratos/schemas";
import { sendContractForSignatureDomain } from "@/lib/contratos/send-for-signature";
import {
  cancelFormRequestDomain,
  createFormRequestDomain,
  resendFormRequestDomain,
} from "@/lib/contratos/form-requests";
import { deleteContractDomain } from "@/lib/contratos/delete-contract";

type ActionResult = {
  error?: string;
  ok?: true;
  id?: string;
  url?: string;
  whatsapp?: boolean;
  signLink?: string | null;
  autentiqueRemoved?: boolean | null;
  signed?: boolean;
  rejected?: boolean;
  viewed?: boolean;
};

async function publicOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return `https://${host}`;
}

export async function createContract(form: FormData) {
  await getProfile();
  const supabase = await createClient();
  const createdBy = (await supabase.auth.getUser()).data.user?.id ?? null;
  const parsed = parseCreateContractForm(form, createdBy);
  if ("error" in parsed) return { error: parsed.error };

  const r = await createContractDomain(
    supabase,
    createAdminClient(),
    parsed.data
  );
  if ("error" in r) return { error: r.error };

  revalidatePath("/contratos");
  return { id: r.id };
}

/**
 * Gera o contrato a partir do MODELO (Tráfego Pago): preenche o texto com os
 * dados, cria o PDF formatado e salva como rascunho — pronto pra revisar e
 * enviar pra assinatura. Zero Word.
 */
export async function generateContractFromTemplate(form: FormData) {
  await getProfile();
  const supabase = await createClient();

  const leadId = String(form.get("lead_id") ?? "");
  if (!leadId) return { error: "Escolha o cliente." };
  const { data: lead } = await supabase
    .from("leads")
    .select("id, name, phone, email")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { error: "Cliente não encontrado." };

  const parsed = parseGenerateFromTemplateForm(form, lead);
  if ("error" in parsed) return { error: parsed.error };

  const { createContractFromTemplateData } = await import("@/lib/contracts");
  const r = await createContractFromTemplateData(
    supabase,
    leadId,
    parsed.data,
    (await supabase.auth.getUser()).data.user?.id ?? null
  );
  if (r.error) return { error: r.error };

  revalidatePath("/contratos");
  return { id: r.id };
}

export async function createFormRequest(form: FormData): Promise<ActionResult> {
  const profile = await getProfile();
  const supabase = await createClient();
  const leadId = String(form.get("lead_id") ?? "");
  if (!leadId) return { error: "Escolha o cliente." };

  const s = (k: string) => String(form.get(k) ?? "").trim();
  const r = await createFormRequestDomain(supabase, {
    leadId,
    terms: {
      valorMensal: Number(
        s("valor_mensal").replace(/\./g, "").replace(",", ".") || 0
      ),
      prazoMeses: Number(s("prazo_meses") || 0),
      dataInicio: s("data_inicio"),
      diaVencimento: Number(s("dia_vencimento") || 0),
      comarca: s("comarca") || "Acreúna – Goiás",
    },
    createdBy: profile.id,
    publicBaseUrl: await publicOrigin(),
    sentBy: profile.id,
  });
  if ("error" in r) return { error: r.error };
  revalidatePath("/contratos");
  return { id: r.id, url: r.url, whatsapp: r.whatsapp };
}

export async function resendFormRequest(
  requestId: string
): Promise<ActionResult> {
  const profile = await getProfile();
  const supabase = await createClient();
  const r = await resendFormRequestDomain(
    supabase,
    requestId,
    await publicOrigin(),
    { sentBy: profile.id }
  );
  if ("error" in r) return { error: r.error };
  return { ok: true };
}

export async function cancelFormRequest(
  requestId: string
): Promise<ActionResult> {
  await getProfile();
  const supabase = await createClient();
  const r = await cancelFormRequestDomain(supabase, requestId);
  if ("error" in r) return { error: r.error };
  revalidatePath("/contratos");
  return { ok: true };
}

export async function sendContractForSignature(
  contractId: string
): Promise<ActionResult> {
  const profile = await getProfile();
  const supabase = await createClient();
  const r = await sendContractForSignatureDomain(
    supabase,
    createAdminClient(),
    contractId,
    { sentBy: profile.id }
  );
  if ("error" in r) return { error: r.error };
  revalidatePath("/contratos");
  return { ok: true, whatsapp: r.whatsapp, signLink: r.signLink };
}

export async function refreshContractStatus(
  contractId: string
): Promise<ActionResult> {
  await getProfile();
  const supabase = await createClient();
  const { syncContractSignature } = await import(
    "@/lib/contratos/sync-signature"
  );
  const r = await syncContractSignature(
    supabase,
    createAdminClient(),
    contractId
  );
  if (!r.ok) return { error: r.error };

  revalidatePath("/contratos");
  return {
    ok: true,
    signed: r.signed,
    rejected: r.rejected,
    viewed: r.viewed,
  };
}

export async function getContractPdfUrl(contractId: string) {
  await getProfile();
  const supabase = await createClient();
  return getContractPdfUrlDomain(
    supabase,
    createAdminClient(),
    contractId
  );
}

export async function closeContract(contractId: string) {
  await getProfile();
  const supabase = await createClient();
  const r = await closeContractDomain(supabase, contractId);
  if ("error" in r) return { error: r.error };
  revalidatePath("/contratos");
  return { ok: true };
}

export async function deleteContract(
  contractId: string
): Promise<ActionResult> {
  await getProfile();
  const supabase = await createClient();
  const r = await deleteContractDomain(
    supabase,
    createAdminClient(),
    contractId
  );
  if ("error" in r) return { error: r.error };
  revalidatePath("/contratos");
  return { ok: true, autentiqueRemoved: r.autentiqueRemoved };
}
