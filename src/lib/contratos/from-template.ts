import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  renderTrafegoPago,
  TRAFEGO_PAGO_LABEL,
  type TrafegoPagoInput,
} from "@/lib/data/contract-templates/trafego-pago";
import { contractTextToPdf } from "@/lib/contract-pdf";
import { uploadContractPdf } from "@/lib/contratos/storage";

// Núcleo compartilhado: preenche o modelo, gera o PDF e salva o contrato
// como rascunho. Usado pela equipe (action autenticada) e pelo OPS Form
// (fluxo público com service role).
export async function createContractFromTemplateData(
  db: SupabaseClient,
  leadId: string,
  input: TrafegoPagoInput,
  createdBy: string | null
): Promise<{ id?: string; error?: string }> {
  const text = renderTrafegoPago(input);
  const pdf = await contractTextToPdf(text);

  const fim = new Date(input.dataInicio);
  fim.setMonth(fim.getMonth() + input.prazoMeses);
  fim.setDate(fim.getDate() - 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const { data: row, error } = await db
    .from("contracts")
    .insert({
      lead_id: leadId,
      title: `${TRAFEGO_PAGO_LABEL} — ${input.contratanteNome}`,
      value: input.valorMensal,
      starts_at: iso(input.dataInicio),
      ends_at: iso(fim),
      signer_email: input.email,
      status: "rascunho",
      template_data: input,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const admin = createAdminClient();
  const up = await uploadContractPdf(admin, row.id as string, pdf);
  if ("error" in up) {
    await db.from("contracts").delete().eq("id", row.id);
    return { error: up.error };
  }
  await db.from("contracts").update({ file_path: up.path }).eq("id", row.id);
  return { id: row.id as string };
}
