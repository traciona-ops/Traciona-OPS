import type { SupabaseClient } from "@supabase/supabase-js";
import {
  autentiqueConfigured,
  createSignatureDocument,
} from "@/lib/services/autentique";
import { CONTRACTS_BUCKET } from "@/lib/contratos/storage";
import { sendTextToLead } from "@/lib/whatsapp/send-text-to-lead";

type LeadRow = { id: string; name: string; phone: string | null };

/**
 * Rascunho → Autentique + status enviado + link no WhatsApp do lead.
 */
export async function sendContractForSignatureDomain(
  db: SupabaseClient,
  admin: SupabaseClient,
  contractId: string,
  opts?: { sentBy?: string | null }
): Promise<
  | { ok: true; whatsapp: boolean; signLink: string | null }
  | { error: string }
> {
  const { data: c } = await db
    .from("contracts")
    .select(
      "id, title, status, file_path, signer_email, lead:leads(id, name, phone)"
    )
    .eq("id", contractId)
    .maybeSingle();
  const contract = c as unknown as {
    id: string;
    title: string;
    status: string;
    file_path: string | null;
    signer_email: string | null;
    lead: LeadRow | null;
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

  const { data: blob, error: dlErr } = await admin.storage
    .from(CONTRACTS_BUCKET)
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

  await db
    .from("contracts")
    .update({
      status: "enviado",
      autentique_id: doc.id,
      sign_link: doc.signLink,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", contract.id);

  let whatsapp = false;
  if (doc.signLink && contract.lead.phone) {
    const first = contract.lead.name.split(" ")[0];
    const r = await sendTextToLead(db, {
      leadId: contract.lead.id,
      body: `Olá, ${first}! Segue o seu contrato "${contract.title}" para assinatura digital pela Autentique:\n\n${doc.signLink}\n\nQualquer dúvida é só chamar por aqui. 🙂`,
      sentBy: opts?.sentBy ?? null,
    });
    whatsapp = !("error" in r);
  }

  return { ok: true, whatsapp, signLink: doc.signLink };
}
