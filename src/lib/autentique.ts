// Integração Autentique (assinatura digital) — API GraphQL v2.
// Docs: docs.autentique.com.br/api. Rate limit: 60 req/min.
// O token NUNCA sai do servidor (env AUTENTIQUE_TOKEN).

import { getIntegrationSecret } from "@/lib/integrations";

const API = "https://api.autentique.com.br/v2/graphql";

// token: Configurações → Integrações (banco) primeiro; .env de reserva
async function getToken(): Promise<string | undefined> {
  const db = await getIntegrationSecret("autentique");
  return db.token?.trim() || process.env.AUTENTIQUE_TOKEN?.trim();
}

export async function autentiqueConfigured(): Promise<boolean> {
  return !!(await getToken());
}

async function gql<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<{ data?: T; error?: string }> {
  const TOKEN = await getToken();
  if (!TOKEN) return { error: "Autentique não configurada (AUTENTIQUE_TOKEN)." };
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(20000),
    });
    const json = await res.json().catch(() => ({}));
    if (json?.errors?.length)
      return { error: String(json.errors[0]?.message ?? "Erro na Autentique.") };
    if (!res.ok) return { error: `Autentique HTTP ${res.status}` };
    return { data: json?.data as T };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Conta conectada (pra tela de Integrações). */
export async function accountInfo(): Promise<{
  name?: string;
  email?: string;
  error?: string;
}> {
  const { data, error } = await gql<{
    me?: { name?: string; email?: string };
  }>("query { me { name email } }");
  if (error) return { error };
  return { name: data?.me?.name, email: data?.me?.email };
}

export type CreatedDocument = {
  id: string;
  /** Link de assinatura do signatário (short_link) — enviamos pelo NOSSO WhatsApp. */
  signLink: string | null;
};

/**
 * Cria o documento na Autentique com UM signatário e devolve o link de
 * assinatura. Sem e-mail → a Autentique não dispara nada e o link é nosso
 * pra entregar (WhatsApp); com e-mail → ela também envia por lá.
 */
export async function createSignatureDocument(input: {
  name: string;
  signerName: string;
  signerEmail?: string | null;
  pdf: Uint8Array;
  filename: string;
  sandbox?: boolean;
}): Promise<{ doc?: CreatedDocument; error?: string }> {
  const TOKEN = await getToken();
  if (!TOKEN) return { error: "Autentique não configurada (AUTENTIQUE_TOKEN)." };

  const signer: Record<string, unknown> = {
    name: input.signerName,
    action: "SIGN",
  };
  if (input.signerEmail?.trim()) signer.email = input.signerEmail.trim();

  const query = `mutation CreateDocumentMutation($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {
    createDocument(sandbox: ${input.sandbox ? "true" : "false"}, document: $document, signers: $signers, file: $file) {
      id name created_at
      signatures { public_id name email link { short_link } }
    }
  }`;

  const operations = JSON.stringify({
    query,
    variables: {
      document: { name: input.name },
      signers: [signer],
      file: null,
    },
  });

  const form = new FormData();
  form.append("operations", operations);
  form.append("map", JSON.stringify({ file: ["variables.file"] }));
  form.append(
    "file",
    new Blob([Buffer.from(input.pdf)], { type: "application/pdf" }),
    input.filename
  );

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
      body: form,
      signal: AbortSignal.timeout(60000),
    });
    const json = await res.json().catch(() => ({}));
    if (json?.errors?.length)
      return { error: String(json.errors[0]?.message ?? "Erro na Autentique.") };
    const doc = json?.data?.createDocument;
    if (!doc?.id) return { error: `Autentique não criou o documento (HTTP ${res.status}).` };
    const link =
      doc.signatures?.find(
        (s: { link?: { short_link?: string } }) => s?.link?.short_link
      )?.link?.short_link ?? null;
    return { doc: { id: String(doc.id), signLink: link } };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * Apaga o documento na Autentique (vai pra lixeira de lá; se alguém já
 * assinou, a Autentique só move pra lixeira de quem pediu).
 */
export async function deleteSignatureDocument(
  documentId: string
): Promise<{ ok: boolean; error?: string }> {
  const q = `mutation { deleteDocument(id: "${documentId.replace(/[^a-zA-Z0-9_-]/g, "")}") }`;
  const { data, error } = await gql<{ deleteDocument?: boolean }>(q);
  if (error) return { ok: false, error };
  return { ok: !!data?.deleteDocument };
}

export type DocumentStatus = {
  viewedAt: string | null;
  signedAt: string | null;
  rejectedAt: string | null;
  /** URL do PDF assinado (quando concluído). */
  signedUrl: string | null;
  signLink: string | null;
};

/** Consulta o andamento da assinatura na Autentique. */
export async function getSignatureStatus(
  documentId: string
): Promise<{ status?: DocumentStatus; error?: string }> {
  const q = `query {
    document(id: "${documentId.replace(/[^a-zA-Z0-9_-]/g, "")}") {
      id
      files { original signed }
      signatures {
        public_id
        link { short_link }
        viewed { created_at }
        signed { created_at }
        rejected { created_at }
      }
    }
  }`;
  type Resp = {
    document?: {
      files?: { signed?: string | null };
      signatures?: {
        link?: { short_link?: string | null };
        viewed?: { created_at?: string } | null;
        signed?: { created_at?: string } | null;
        rejected?: { created_at?: string } | null;
      }[];
    };
  };
  const { data, error } = await gql<Resp>(q);
  if (error) return { error };
  const d = data?.document;
  if (!d) return { error: "Documento não encontrado na Autentique." };
  // 1 signatário por contrato (nosso fluxo) — pega o primeiro com dados
  const sig = d.signatures?.[0];
  return {
    status: {
      viewedAt: sig?.viewed?.created_at ?? null,
      signedAt: sig?.signed?.created_at ?? null,
      rejectedAt: sig?.rejected?.created_at ?? null,
      signedUrl: d.files?.signed ?? null,
      signLink: sig?.link?.short_link ?? null,
    },
  };
}
