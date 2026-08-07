"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OpsAnswers } from "@/components/ops-form/ops-form-wizard";

// Submissão PÚBLICA do OPS Form (sem login — a chave é o token).
// Valida, gera o contrato do modelo na hora e marca como respondido.
export async function submitOpsForm(token: string, answers: OpsAnswers) {
  if (!token || token.length < 30) return { error: "Link inválido." };
  const admin = createAdminClient();

  const { data } = await admin
    .from("form_requests")
    .select("id, status, terms, created_by, lead:leads(id, name, phone)")
    .eq("token", token)
    .maybeSingle();
  const req = data as unknown as {
    id: string;
    status: string;
    terms: {
      valorMensal: number;
      prazoMeses: number;
      dataInicio: string;
      diaVencimento: number;
      comarca: string;
    } | null;
    created_by: string | null;
    lead: { id: string; name: string; phone: string | null } | null;
  } | null;

  if (!req || req.status === "cancelado") return { error: "Esse link não está mais ativo." };
  if (req.status === "respondido")
    return { error: "Esses dados já foram enviados. Obrigado!" };
  if (!req.terms || !req.lead) return { error: "Formulário incompleto — fala com a gente no WhatsApp." };

  const t = (v: unknown) => String(v ?? "").trim();
  const a = {
    tipo: t(answers.tipo).startsWith("Empresa") ? ("pj" as const) : ("pf" as const),
    nome: t(answers.nome),
    nacionalidade: t(answers.nacionalidade),
    estadoCivil: t(answers.estadoCivil),
    profissao: t(answers.profissao),
    rg: t(answers.rg),
    cpf: t(answers.cpf),
    cnpj: t(answers.cnpj),
    representante: t(answers.representante),
    endereco: t(answers.endereco),
    cidadeUf: t(answers.cidadeUf),
    cep: t(answers.cep),
    email: t(answers.email),
    empresa: t(answers.empresa),
  };
  // essencial: nome/razão social, documento, endereço completo e e-mail
  if (!a.nome || !a.cpf || !a.endereco || !a.cidadeUf || !a.cep || !a.email)
    return { error: "Faltou preencher algum campo — volta lá e confere." };
  if (a.cpf.replace(/\D/g, "").length !== 11) return { error: "CPF inválido." };
  if (a.tipo === "pj") {
    if (a.cnpj.replace(/\D/g, "").length !== 14)
      return { error: "CNPJ inválido." };
    if (!a.representante)
      return { error: "Faltou dizer quem assina pela empresa." };
  }
  if (!/.+@.+\..+/.test(a.email)) return { error: "E-mail inválido." };

  const enderecoCompleto = `${a.endereco}, ${a.cidadeUf}, CEP ${a.cep}`;
  const telefone = req.lead.phone ? fmtPhone(req.lead.phone) : "";

  const { createContractFromTemplateData } = await import("@/lib/contracts");
  const r = await createContractFromTemplateData(
    admin,
    req.lead.id,
    {
      tipo: a.tipo,
      contratanteNome: a.nome,
      nacionalidade: a.nacionalidade,
      estadoCivil: a.estadoCivil,
      profissao: a.profissao,
      rg: a.rg,
      cpf: a.cpf,
      cnpj: a.cnpj,
      representante: a.representante,
      endereco: enderecoCompleto,
      telefone,
      email: a.email,
      empresa: a.empresa,
      prazoMeses: req.terms.prazoMeses,
      dataInicio: new Date(`${req.terms.dataInicio}T12:00:00-03:00`),
      valorMensal: req.terms.valorMensal,
      diaVencimento: req.terms.diaVencimento,
      comarca: req.terms.comarca,
    },
    req.created_by
  );
  if (r.error || !r.id) return { error: "Deu algo errado ao gerar o contrato — tenta de novo em instantes." };

  await admin
    .from("form_requests")
    .update({
      status: "respondido",
      answers: a,
      contract_id: r.id,
      answered_at: new Date().toISOString(),
    })
    .eq("id", req.id);

  revalidatePath("/contratos");
  return { ok: true };
}

function fmtPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 13)
    return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12 && d.startsWith("55"))
    return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return phone;
}
