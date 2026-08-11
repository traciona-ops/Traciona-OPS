import type { SupabaseClient } from "@supabase/supabase-js";

export const CONTRACTS_BUCKET = "contracts";
export const MAX_CONTRACT_PDF_BYTES = 4.5 * 1024 * 1024;

export async function uploadContractPdf(
  admin: SupabaseClient,
  contractId: string,
  bytes: Uint8Array
): Promise<{ path: string } | { error: string }> {
  const path = `${contractId}.pdf`;
  const { error } = await admin.storage
    .from(CONTRACTS_BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (error) return { error: `Falha no upload: ${error.message}` };
  return { path };
}
