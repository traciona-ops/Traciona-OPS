import { createAdminClient } from "@/lib/supabase/admin";

// Multi-número: a conversa responde PELO NÚMERO em que ela acontece.
// A referência é a última mensagem com number_id; sem nenhuma, é a
// instância principal (token do env → authToken undefined).

export type LeadNumber = { numberId: string | null; token: string | undefined };

export async function resolveLeadNumber(leadId: string): Promise<LeadNumber> {
  const admin = createAdminClient();
  const { data: msg } = await admin
    .from("whatsapp_messages")
    .select("number_id")
    .eq("lead_id", leadId)
    .not("number_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const numberId = (msg as { number_id: string | null } | null)?.number_id ?? null;
  if (!numberId) return { numberId: null, token: undefined };

  const { data } = await admin
    .from("wa_numbers")
    .select("token, active, env_default")
    .eq("id", numberId)
    .maybeSingle();
  const n = data as
    | { token: string | null; active: boolean; env_default: boolean }
    | null;
  // número sumiu/desativado/principal → cai pra instância do env
  if (!n || !n.active || n.env_default || !n.token) {
    return { numberId: null, token: undefined };
  }
  return { numberId, token: n.token };
}

/** Token de uma instância específica (null/env_default → principal do env). */
export async function tokenForNumberId(
  numberId: string | null | undefined
): Promise<string | undefined> {
  if (!numberId) return undefined;
  const admin = createAdminClient();
  const { data } = await admin
    .from("wa_numbers")
    .select("token, env_default")
    .eq("id", numberId)
    .maybeSingle();
  const n = data as { token: string | null; env_default: boolean } | null;
  return n && !n.env_default && n.token ? n.token : undefined;
}
