import type { SupabaseClient } from "@supabase/supabase-js";
import {
  autentiqueConfigured,
  deleteSignatureDocument,
} from "@/lib/services/autentique";
import { CONTRACTS_BUCKET } from "@/lib/contratos/storage";

/**
 * Remove na Autentique (se houver) e apaga registro + PDF do bucket.
 */
export async function deleteContractDomain(
  db: SupabaseClient,
  admin: SupabaseClient,
  contractId: string
): Promise<
  | { ok: true; autentiqueRemoved: boolean | null }
  | { error: string }
> {
  const { data: c } = await db
    .from("contracts")
    .select("status, file_path, autentique_id")
    .eq("id", contractId)
    .maybeSingle();
  if (!c) return { error: "Contrato não encontrado." };

  let autentiqueRemoved: boolean | null = null;
  if (c.autentique_id) {
    if (!(await autentiqueConfigured())) {
      autentiqueRemoved = false;
    } else {
      const r = await deleteSignatureDocument(c.autentique_id as string);
      autentiqueRemoved = r.ok;
      const jaSumiu = /not_found|não encontrad/i.test(r.error ?? "");
      if (!r.ok && !jaSumiu)
        return {
          error: `Não consegui remover na Autentique (${r.error ?? "erro desconhecido"}). O contrato não foi excluído — tenta de novo.`,
        };
      if (jaSumiu) autentiqueRemoved = true;
    }
  }

  const { error } = await db.from("contracts").delete().eq("id", contractId);
  if (error) return { error: error.message };
  if (c.file_path) {
    await admin.storage
      .from(CONTRACTS_BUCKET)
      .remove([c.file_path as string]);
  }
  return { ok: true, autentiqueRemoved };
}
