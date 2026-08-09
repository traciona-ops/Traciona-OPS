"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
import {
  autentiqueConfigured,
  createSignatureDocument,
  getSignatureStatus,
} from "@/lib/services/autentique";

// Contratos do Setor Comercial. PDF original no bucket privado 'contracts';
// envio de assinatura via Autentique; o LINK vai pelo NOSSO WhatsApp (cai
// registrado na conversa do OPS Chat).

const BUCKET = "contracts";
const MAX_PDF = 4.5 * 1024 * 1024; // margem sob o bodySizeLimit de 5mb

export async function createContract(form: FormData) {
  await getProfile();
  const supabase = await createClient();

  const leadId = String(form.get("lead_id") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const valueRaw = String(form.get("value") ?? "").replace(",", ".");
  const startsAt = String(form.get("starts_at") ?? "") || null;
  const endsAt = String(form.get("ends_at") ?? "") || null;
  const signerEmail = String(form.get("signer_email") ?? "").trim() || null;
  const file = form.get("file") as File | null;

  if (!leadId) return { error: "Escolha o cliente." };
  if (!title) return { error: "Dê um título ao contrato." };
  if (!file || file.size === 0) return { error: "Anexe o PDF do contrato." };
  if (file.type !== "application/pdf")
    return { error: "O arquivo precisa ser um PDF." };
  if (file.size > MAX_PDF)
    return { error: "PDF muito grande (máx. 4,5 MB)." };

  const { data: row, error } = await supabase
    .from("contracts")
    .insert({
      lead_id: leadId,
      title,
      value: valueRaw ? Number(valueRaw) : null,
      starts_at: startsAt,
      ends_at: endsAt,
      signer_email: signerEmail,
      status: "rascunho",
      created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  // upload com service role (bucket privado, sem policies de storage)
  const admin = createAdminClient();
  const path = `${row.id}.pdf`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (upErr) {
    await supabase.from("contracts").delete().eq("id", row.id);
    return { error: `Falha no upload: ${upErr.message}` };
  }
  await supabase.from("contracts").update({ file_path: path }).eq("id", row.id);

  revalidatePath("/contratos");
  return { id: row.id as string };
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

  const s = (k: string) => String(form.get(k) ?? "").trim();
  const input = {
    tipo: (s("tipo") === "pj" ? "pj" : "pf") as "pf" | "pj",
    cnpj: s("cnpj"),
    representante: s("representante"),
    contratanteNome: s("nome") || lead.name,
    nacionalidade: s("nacionalidade") || "brasileiro(a)",
    estadoCivil: s("estado_civil"),
    profissao: s("profissao"),
    rg: s("rg"),
    cpf: s("cpf"),
    endereco: s("endereco"),
    telefone: s("telefone") || (lead.phone ? formatPhoneBR(lead.phone) : ""),
    email: s("email") || (lead.email ?? ""),
    empresa: s("empresa"),
    prazoMeses: Number(s("prazo_meses") || 0),
    dataInicio: s("data_inicio") ? new Date(`${s("data_inicio")}T12:00:00-03:00`) : null,
    valorMensal: Number(s("valor_mensal").replace(/\./g, "").replace(",", ".") || 0),
    diaVencimento: Number(s("dia_vencimento") || 0),
    comarca: s("comarca") || "Acreúna – Goiás",
  };

  // essencial: CPF e endereço (o resto da qualificação é opcional e o
  // modelo se adapta ao que tiver)
  if (!input.cpf || !input.endereco)
    return { error: "Preencha ao menos CPF e endereço do cliente." };
  if (input.tipo === "pj") {
    if (input.cnpj.replace(/\D/g, "").length !== 14)
      return { error: "CNPJ inválido (14 dígitos)." };
    if (!input.representante)
      return { error: "Informe quem assina pela empresa." };
  }
  if (!input.prazoMeses || input.prazoMeses < 1)
    return { error: "Informe o prazo em meses." };
  if (!input.dataInicio) return { error: "Informe a data de início." };
  if (!input.valorMensal || input.valorMensal <= 0)
    return { error: "Informe o valor mensal." };
  if (!input.diaVencimento || input.diaVencimento < 1 || input.diaVencimento > 31)
    return { error: "Dia de vencimento entre 1 e 31." };
  if (!input.email) return { error: "Informe o e-mail do cliente (vai no contrato)." };

  const { createContractFromTemplateData } = await import("@/lib/contracts");
  const r = await createContractFromTemplateData(
    supabase,
    leadId,
    { ...input, dataInicio: input.dataInicio },
    (await supabase.auth.getUser()).data.user?.id ?? null
  );
  if (r.error) return { error: r.error };

  revalidatePath("/contratos");
  return { id: r.id };
}

/**
 * OPS Form: cria o link público pro CLIENTE preencher os próprios dados
 * (estilo Respondi) e manda pelo nosso WhatsApp. A equipe só define os
 * termos comerciais — o contrato nasce sozinho quando o cliente responde.
 */
export async function createFormRequest(form: FormData) {
  const profile = await getProfile();
  const supabase = await createClient();

  const leadId = String(form.get("lead_id") ?? "");
  if (!leadId) return { error: "Escolha o cliente." };
  const { data: lead } = await supabase
    .from("leads")
    .select("id, name, phone")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { error: "Cliente não encontrado." };

  const s = (k: string) => String(form.get(k) ?? "").trim();
  const terms = {
    valorMensal: Number(s("valor_mensal").replace(/\./g, "").replace(",", ".") || 0),
    prazoMeses: Number(s("prazo_meses") || 0),
    dataInicio: s("data_inicio"),
    diaVencimento: Number(s("dia_vencimento") || 0),
    comarca: s("comarca") || "Acreúna – Goiás",
  };
  if (!terms.valorMensal || terms.valorMensal <= 0)
    return { error: "Informe o valor mensal." };
  if (!terms.prazoMeses || terms.prazoMeses < 1)
    return { error: "Informe o prazo em meses." };
  if (!terms.dataInicio) return { error: "Informe a data de início." };
  if (!terms.diaVencimento || terms.diaVencimento < 1 || terms.diaVencimento > 31)
    return { error: "Dia de vencimento entre 1 e 31." };

  const token =
    crypto.randomUUID().replace(/-/g, "") +
    crypto.randomUUID().replace(/-/g, "").slice(0, 8);

  const { data: row, error } = await supabase
    .from("form_requests")
    .insert({
      token,
      lead_id: leadId,
      kind: "contrato_trafego_pago",
      terms,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const url = `https://${host}/f/${token}`;

  let whatsapp = false;
  if (lead.phone) {
    const { sendWhatsappMessage } = await import(
      "@/app/(dashboard)/crm/whatsapp-actions"
    );
    const first = lead.name.split(" ")[0];
    const r = await sendWhatsappMessage(
      lead.id,
      `Olá, ${first}! Pra gente montar o seu contrato, preencha seus dados nesse link — leva menos de 2 minutos:\n\n${url}\n\nAssim que terminar, o contrato já fica pronto pra assinatura. 🙂`
    );
    whatsapp = !r?.error;
  }

  revalidatePath("/contratos");
  return { id: row.id as string, url, whatsapp };
}

/** Reenvia o link do OPS Form pelo WhatsApp. */
export async function resendFormRequest(requestId: string) {
  await getProfile();
  const supabase = await createClient();
  const { data: fr } = await supabase
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
  if (req.status !== "pendente") return { error: "Esse formulário não está pendente." };
  if (!req.lead?.phone) return { error: "O cliente não tem WhatsApp cadastrado." };

  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const url = `https://${host}/f/${req.token}`;

  const { sendWhatsappMessage } = await import(
    "@/app/(dashboard)/crm/whatsapp-actions"
  );
  const first = req.lead.name.split(" ")[0];
  const r = await sendWhatsappMessage(
    req.lead.id,
    `Oi, ${first}! Passando pra lembrar do preenchimento dos seus dados pro contrato — leva menos de 2 minutos:\n\n${url}`
  );
  if (r?.error) return { error: r.error };
  return { ok: true };
}

/** Cancela um OPS Form pendente (o link para de funcionar). */
export async function cancelFormRequest(requestId: string) {
  await getProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("form_requests")
    .update({ status: "cancelado" })
    .eq("id", requestId)
    .eq("status", "pendente");
  if (error) return { error: error.message };
  revalidatePath("/contratos");
  return { ok: true };
}

function formatPhoneBR(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 13)
    return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12 && d.startsWith("55"))
    return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return phone;
}

/**
 * Envia pra assinatura: cria o documento na Autentique e manda o link pelo
 * NOSSO WhatsApp na conversa do cliente (se ele tiver número).
 */
export async function sendContractForSignature(contractId: string) {
  await getProfile();
  const supabase = await createClient();

  const { data: c } = await supabase
    .from("contracts")
    .select("id, title, status, file_path, signer_email, lead:leads(id, name, phone)")
    .eq("id", contractId)
    .maybeSingle();
  const contract = c as unknown as {
    id: string;
    title: string;
    status: string;
    file_path: string | null;
    signer_email: string | null;
    lead: { id: string; name: string; phone: string | null } | null;
  } | null;

  if (!contract) return { error: "Contrato não encontrado." };
  if (contract.status !== "rascunho")
    return { error: "Esse contrato já foi enviado." };
  if (!contract.file_path) return { error: "Contrato sem PDF anexado." };
  if (!contract.lead) return { error: "Contrato sem cliente vinculado." };
  if (!(await autentiqueConfigured()))
    return {
      error:
        "Integração Autentique aguardando o token (AUTENTIQUE_TOKEN). Cole o token e faça o deploy.",
    };

  const admin = createAdminClient();
  const { data: blob, error: dlErr } = await admin.storage
    .from(BUCKET)
    .download(contract.file_path);
  if (dlErr || !blob) return { error: "Não consegui ler o PDF do contrato." };

  const { doc, error } = await createSignatureDocument({
    name: contract.title,
    signerName: contract.lead.name,
    signerEmail: contract.signer_email,
    pdf: new Uint8Array(await blob.arrayBuffer()),
    filename: `${contract.title}.pdf`,
  });
  if (error || !doc) return { error: error ?? "Falha ao criar na Autentique." };

  await supabase
    .from("contracts")
    .update({
      status: "enviado",
      autentique_id: doc.id,
      sign_link: doc.signLink,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", contract.id);

  // link pelo nosso WhatsApp → fica na conversa do OPS Chat
  let whatsapp = false;
  if (doc.signLink && contract.lead.phone) {
    const { sendWhatsappMessage } = await import(
      "@/app/(dashboard)/crm/whatsapp-actions"
    );
    const first = contract.lead.name.split(" ")[0];
    const r = await sendWhatsappMessage(
      contract.lead.id,
      `Olá, ${first}! Segue o seu contrato "${contract.title}" para assinatura digital pela Autentique:\n\n${doc.signLink}\n\nQualquer dúvida é só chamar por aqui. 🙂`
    );
    whatsapp = !r?.error;
  }

  revalidatePath("/contratos");
  return { ok: true, whatsapp, signLink: doc.signLink };
}

/** Consulta a Autentique e sincroniza o status (assinado/recusado). */
export async function refreshContractStatus(contractId: string) {
  await getProfile();
  const supabase = await createClient();

  const { data: c } = await supabase
    .from("contracts")
    .select("id, status, autentique_id")
    .eq("id", contractId)
    .maybeSingle();
  if (!c?.autentique_id) return { error: "Contrato ainda não foi enviado." };

  const { status, error } = await getSignatureStatus(c.autentique_id);
  if (error || !status) return { error: error ?? "Falha na consulta." };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status.signedAt) {
    patch.status = "assinado";
    patch.signed_at = status.signedAt;
    if (status.signedUrl) patch.signed_file_url = status.signedUrl;
  } else if (status.rejectedAt) {
    patch.status = "recusado";
  }
  await supabase.from("contracts").update(patch).eq("id", c.id);

  // Contrato assinado (transição) → venda recorrente + cobrança no Asaas
  if (status.signedAt && c.status === "enviado") {
    const { createSaleFromContract } = await import("@/lib/sales");
    await createSaleFromContract(createAdminClient(), c.id);
  }

  // Comprovante pro cliente (VibeUX 78) — só na TRANSIÇÃO pra assinado,
  // nunca em cliques repetidos no refresh.
  if (status.signedAt && c.status === "enviado") {
    const { data: cc } = await supabase
      .from("contracts")
      .select("title, lead:leads(id, name, phone)")
      .eq("id", c.id)
      .maybeSingle();
    const lead = (
      cc as unknown as {
        title: string;
        lead: { id: string; name: string; phone: string | null } | null;
      } | null
    )?.lead;
    if (lead?.phone) {
      const admin = createAdminClient();
      const first = lead.name.split(" ")[0];
      await admin.from("scheduled_messages").insert({
        lead_id: lead.id,
        body: `Assinatura recebida, ${first}! O seu contrato "${(cc as { title?: string })?.title}" está assinado e vale a partir de agora. Obrigado pela confiança — qualquer coisa é só chamar por aqui.`,
        send_at: new Date().toISOString(),
        status: "pending",
        created_by: null,
      });
    }
  }

  revalidatePath("/contratos");
  return {
    ok: true,
    signed: !!status.signedAt,
    rejected: !!status.rejectedAt,
    viewed: !!status.viewedAt,
  };
}

/** URL temporária (1h) pra ver o PDF original do bucket privado. */
export async function getContractPdfUrl(contractId: string) {
  await getProfile();
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("contracts")
    .select("file_path, signed_file_url, status")
    .eq("id", contractId)
    .maybeSingle();
  if (!c) return { error: "Contrato não encontrado." };
  // assinado → serve o PDF da Autentique (com as assinaturas)
  if (c.status === "assinado" && c.signed_file_url)
    return { url: c.signed_file_url as string };
  if (!c.file_path) return { error: "Contrato sem PDF." };
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(c.file_path as string, 3600);
  if (error || !data?.signedUrl) return { error: "Falha ao gerar o link." };
  return { url: data.signedUrl };
}

export async function closeContract(contractId: string) {
  await getProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("contracts")
    .update({ status: "encerrado", updated_at: new Date().toISOString() })
    .eq("id", contractId)
    .eq("status", "assinado");
  if (error) return { error: error.message };
  revalidatePath("/contratos");
  return { ok: true };
}

/**
 * Exclui o contrato NAS DUAS PONTAS: aqui (registro + PDF do bucket) e na
 * Autentique (se já tinha sido enviado — o link de assinatura morre).
 */
export async function deleteContract(contractId: string) {
  await getProfile();
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("contracts")
    .select("status, file_path, autentique_id")
    .eq("id", contractId)
    .maybeSingle();
  if (!c) return { error: "Contrato não encontrado." };

  // primeiro a Autentique — se falhar, o contrato continua aqui pra retry
  let autentiqueRemoved: boolean | null = null;
  if (c.autentique_id) {
    if (!(await autentiqueConfigured())) {
      autentiqueRemoved = false;
    } else {
      const { deleteSignatureDocument } = await import("@/lib/services/autentique");
      const r = await deleteSignatureDocument(c.autentique_id as string);
      autentiqueRemoved = r.ok;
      // "não encontrado" = já foi removido por lá (painel, lixeira...) — segue
      const jaSumiu = /not_found|não encontrad/i.test(r.error ?? "");
      if (!r.ok && !jaSumiu)
        return {
          error: `Não consegui remover na Autentique (${r.error ?? "erro desconhecido"}). O contrato não foi excluído — tenta de novo.`,
        };
      if (jaSumiu) autentiqueRemoved = true;
    }
  }

  const { error } = await supabase.from("contracts").delete().eq("id", contractId);
  if (error) return { error: error.message };
  if (c.file_path) {
    const admin = createAdminClient();
    await admin.storage.from(BUCKET).remove([c.file_path as string]);
  }
  revalidatePath("/contratos");
  return { ok: true, autentiqueRemoved };
}
