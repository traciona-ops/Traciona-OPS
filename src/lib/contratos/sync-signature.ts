import type { SupabaseClient } from "@supabase/supabase-js";
import {
  autentiqueConfigured,
  getSignatureStatus,
} from "@/lib/services/autentique";
import { createSaleFromContract } from "@/lib/vendas/from-contract";

type LeadRow = { id: string; name: string; phone: string | null };

const SIGNED_RECEIPT = (first: string, title: string) =>
  `Assinatura recebida, ${first}! O seu contrato "${title}" está assinado e vale a partir de agora. Obrigado pela confiança — qualquer coisa é só chamar por aqui.`;

export type SyncSignatureResult =
  | { ok: false; error: string }
  | {
      ok: true;
      signed: boolean;
      rejected: boolean;
      viewed: boolean;
      transitionedToSigned: boolean;
      sale?: { created: boolean; reason?: string };
    };

/**
 * Consulta Autentique, atualiza status do contrato e, na transição
 * enviado→assinado, cria venda + agenda comprovante no WhatsApp.
 * Usado pelo refresh manual e pelo cron.
 */
export async function syncContractSignature(
  db: SupabaseClient,
  admin: SupabaseClient,
  contractId: string
): Promise<SyncSignatureResult> {
  const { data: c } = await db
    .from("contracts")
    .select("id, status, autentique_id")
    .eq("id", contractId)
    .maybeSingle();
  if (!c?.autentique_id) return { ok: false, error: "Contrato ainda não foi enviado." };

  const { status, error } = await getSignatureStatus(c.autentique_id as string);
  if (error || !status) return { ok: false, error: error ?? "Falha na consulta." };

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (status.signedAt) {
    patch.status = "assinado";
    patch.signed_at = status.signedAt;
    if (status.signedUrl) patch.signed_file_url = status.signedUrl;
  } else if (status.rejectedAt) {
    patch.status = "recusado";
  }
  await db.from("contracts").update(patch).eq("id", c.id);

  const transitionedToSigned = !!(status.signedAt && c.status === "enviado");
  let sale: { created: boolean; reason?: string } | undefined;

  if (transitionedToSigned) {
    sale = await createSaleFromContract(admin, c.id as string);
    await scheduleSignedReceipt(admin, c.id as string);
  }

  return {
    ok: true,
    signed: !!status.signedAt,
    rejected: !!status.rejectedAt,
    viewed: !!status.viewedAt,
    transitionedToSigned,
    sale,
  };
}

async function scheduleSignedReceipt(admin: SupabaseClient, contractId: string) {
  const { data: cc } = await admin
    .from("contracts")
    .select("title, lead:leads(id, name, phone)")
    .eq("id", contractId)
    .maybeSingle();
  const row = cc as unknown as {
    title: string;
    lead: LeadRow | null;
  } | null;
  const lead = row?.lead;
  if (!lead?.phone) return;

  const first = lead.name.split(" ")[0];
  await admin.from("scheduled_messages").insert({
    lead_id: lead.id,
    body: SIGNED_RECEIPT(first, row?.title ?? ""),
    send_at: new Date().toISOString(),
    status: "pending",
    created_by: null,
  });
}

/** Cron: até `limit` contratos "enviado", mais antigos primeiro (rate limit). */
export async function syncPendingContractSignatures(
  admin: SupabaseClient,
  limit = 3
): Promise<number> {
  if (!(await autentiqueConfigured())) return 0;

  const { data: pend } = await admin
    .from("contracts")
    .select("id, autentique_id")
    .eq("status", "enviado")
    .not("autentique_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(limit);

  let synced = 0;
  for (const c of (pend ?? []) as { id: string; autentique_id: string }[]) {
    const r = await syncContractSignature(admin, admin, c.id);
    if (!r.ok) continue;
    if (r.signed || r.rejected) {
      synced++;
      console.log(
        `[cron] contrato ${r.signed ? "assinado" : "recusado"}: ${c.id}`
      );
    }
    if (r.sale?.created) {
      console.log(
        `[cron] venda criada do contrato ${c.id}${
          r.sale.reason ? ` (${r.sale.reason})` : ""
        }`
      );
    }
  }
  return synced;
}
