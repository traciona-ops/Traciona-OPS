"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

// Actions internas do Onboarding (equipe logada; RLS auth).

async function baseUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return `https://${host}`;
}

export async function createOnboarding(input: {
  leadId?: string | null;
  clientName?: string;
}) {
  const profile = await getProfile();
  const supabase = await createClient();
  const clientName = (input.clientName ?? "").trim();
  if (!input.leadId && !clientName)
    return { error: "Escolhe um contato ou escreve o nome do cliente." };

  const token = randomUUID().replace(/-/g, "");
  const { data, error } = await supabase
    .from("onboarding_requests")
    .insert({
      token,
      lead_id: input.leadId || null,
      client_name: clientName,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/onboarding");
  return { ok: true, id: data.id as string, link: `${await baseUrl()}/o/${token}` };
}

/** Envia (ou reenvia) o link pelo NOSSO WhatsApp — precisa de lead com telefone. */
export async function sendOnboardingLink(id: string) {
  await getProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("onboarding_requests")
    .select("token, status, client_name, lead:leads(id, name, phone)")
    .eq("id", id)
    .maybeSingle();
  const req = data as unknown as {
    token: string;
    status: string;
    client_name: string;
    lead: { id: string; name: string; phone: string | null } | null;
  } | null;
  if (!req) return { error: "Onboarding não encontrado." };
  if (req.status === "cancelado") return { error: "Esse onboarding foi cancelado." };
  if (!req.lead?.phone)
    return { error: "Sem contato com WhatsApp vinculado — copia o link e envia manualmente." };

  const url = `${await baseUrl()}/o/${req.token}`;
  const first = (req.lead.name || req.client_name || "").split(" ")[0];
  const { sendWhatsappMessage } = await import(
    "@/app/(dashboard)/crm/whatsapp-actions"
  );
  const r = await sendWhatsappMessage(
    req.lead.id,
    `${first}, bora começar! 🚀\n\nPreparamos o onboarding de vocês — são umas perguntas rápidas pra gente montar o planejamento certeiro:\n\n${url}\n\nLeva uns 5 minutos e dá pra pausar e voltar depois.`
  );
  if (r && "error" in r && r.error) return { error: r.error };
  revalidatePath("/onboarding");
  return { ok: true };
}

export async function cancelOnboarding(id: string) {
  await getProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("onboarding_requests")
    .update({ status: "cancelado", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/onboarding");
  return { ok: true };
}

export async function deleteOnboarding(id: string) {
  await getProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("onboarding_requests")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/onboarding");
  return { ok: true };
}
