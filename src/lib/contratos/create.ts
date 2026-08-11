import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONTRACTS_BUCKET,
  uploadContractPdf,
} from "@/lib/contratos/storage";
import type { CreateContractInput } from "@/lib/contratos/schemas";

export async function createContractDomain(
  db: SupabaseClient,
  admin: SupabaseClient,
  input: CreateContractInput
): Promise<{ id: string } | { error: string }> {
  const { data: row, error } = await db
    .from("contracts")
    .insert({
      lead_id: input.leadId,
      title: input.title,
      value: input.value,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      signer_email: input.signerEmail,
      status: "rascunho",
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const up = await uploadContractPdf(admin, row.id as string, bytes);
  if ("error" in up) {
    await db.from("contracts").delete().eq("id", row.id);
    return { error: up.error };
  }
  await db
    .from("contracts")
    .update({ file_path: up.path })
    .eq("id", row.id);

  return { id: row.id as string };
}

export async function getContractPdfUrlDomain(
  db: SupabaseClient,
  admin: SupabaseClient,
  contractId: string
): Promise<{ url: string } | { error: string }> {
  const { data: c } = await db
    .from("contracts")
    .select("file_path, signed_file_url, status")
    .eq("id", contractId)
    .maybeSingle();
  if (!c) return { error: "Contrato não encontrado." };
  if (c.status === "assinado" && c.signed_file_url)
    return { url: c.signed_file_url as string };
  if (!c.file_path) return { error: "Contrato sem PDF." };
  const { data, error } = await admin.storage
    .from(CONTRACTS_BUCKET)
    .createSignedUrl(c.file_path as string, 3600);
  if (error || !data?.signedUrl) return { error: "Falha ao gerar o link." };
  return { url: data.signedUrl };
}

export async function closeContractDomain(
  db: SupabaseClient,
  contractId: string
): Promise<{ ok: true } | { error: string }> {
  const { error } = await db
    .from("contracts")
    .update({ status: "encerrado", updated_at: new Date().toISOString() })
    .eq("id", contractId)
    .eq("status", "assinado");
  if (error) return { error: error.message };
  return { ok: true };
}
