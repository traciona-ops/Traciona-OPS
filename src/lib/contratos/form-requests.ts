import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTextToLead } from "@/lib/whatsapp/send-text-to-lead";

export type FormRequestTerms = {
  valorMensal: number;
  prazoMeses: number;
  dataInicio: string;
  diaVencimento: number;
  comarca: string;
};

export function validateFormRequestTerms(
  terms: FormRequestTerms
): string | null {
  if (!terms.valorMensal || terms.valorMensal <= 0)
    return "Informe o valor mensal.";
  if (!terms.prazoMeses || terms.prazoMeses < 1)
    return "Informe o prazo em meses.";
  if (!terms.dataInicio) return "Informe a data de início.";
  if (
    !terms.diaVencimento ||
    terms.diaVencimento < 1 ||
    terms.diaVencimento > 31
  )
    return "Dia de vencimento entre 1 e 31.";
  return null;
}

export function buildFormRequestToken(): string {
  return (
    crypto.randomUUID().replace(/-/g, "") +
    crypto.randomUUID().replace(/-/g, "").slice(0, 8)
  );
}

export async function createFormRequestDomain(
  db: SupabaseClient,
  input: {
    leadId: string;
    terms: FormRequestTerms;
    createdBy: string;
    publicBaseUrl: string;
    sentBy?: string | null;
  }
): Promise<
  | { id: string; url: string; whatsapp: boolean }
  | { error: string }
> {
  const termsErr = validateFormRequestTerms(input.terms);
  if (termsErr) return { error: termsErr };

  const { data: lead } = await db
    .from("leads")
    .select("id, name, phone")
    .eq("id", input.leadId)
    .maybeSingle();
  if (!lead) return { error: "Cliente não encontrado." };

  const token = buildFormRequestToken();
  const { data: row, error } = await db
    .from("form_requests")
    .insert({
      token,
      lead_id: input.leadId,
      kind: "contrato_trafego_pago",
      terms: input.terms,
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const url = `${input.publicBaseUrl.replace(/\/$/, "")}/f/${token}`;
  let whatsapp = false;
  if ((lead as { phone: string | null }).phone) {
    const first = (lead as { name: string }).name.split(" ")[0];
    const r = await sendTextToLead(db, {
      leadId: (lead as { id: string }).id,
      body: `Olá, ${first}! Pra gente montar o seu contrato, preencha seus dados nesse link — leva menos de 2 minutos:\n\n${url}\n\nAssim que terminar, o contrato já fica pronto pra assinatura. 🙂`,
      sentBy: input.sentBy ?? null,
    });
    whatsapp = !("error" in r);
  }

  return { id: row.id as string, url, whatsapp };
}

export async function resendFormRequestDomain(
  db: SupabaseClient,
  requestId: string,
  publicBaseUrl: string,
  opts?: { sentBy?: string | null }
): Promise<{ ok: true } | { error: string }> {
  const { data: fr } = await db
    .from("form_requests")
    .select("id, token, status, lead:leads(id, name, phone)")
    .eq("id", requestId)
    .maybeSingle();
  const req = fr as unknown as {
    id: string;
    token: string;
    status: string;
    lead: { id: string; name: string; phone: string | null } | null;
  } | null;
  if (!req) return { error: "Formulário não encontrado." };
  if (req.status !== "pendente")
    return { error: "Esse formulário não está pendente." };
  if (!req.lead?.phone)
    return { error: "O cliente não tem WhatsApp cadastrado." };

  const url = `${publicBaseUrl.replace(/\/$/, "")}/f/${req.token}`;
  const first = req.lead.name.split(" ")[0];
  return sendTextToLead(db, {
    leadId: req.lead.id,
    body: `Oi, ${first}! Passando pra lembrar do preenchimento dos seus dados pro contrato — leva menos de 2 minutos:\n\n${url}`,
    sentBy: opts?.sentBy ?? null,
  });
}

export async function cancelFormRequestDomain(
  db: SupabaseClient,
  requestId: string
): Promise<{ ok: true } | { error: string }> {
  const { error } = await db
    .from("form_requests")
    .update({ status: "cancelado" })
    .eq("id", requestId)
    .eq("status", "pendente");
  if (error) return { error: error.message };
  return { ok: true };
}
