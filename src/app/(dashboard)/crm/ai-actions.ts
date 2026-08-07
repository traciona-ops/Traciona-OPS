"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { aiConfigured, analyzeConversation, draftReply } from "@/lib/ai";

const NOT_CONFIGURED =
  "IA não configurada: adicione a chave ANTHROPIC_API_KEY nas variáveis de ambiente.";

/** Formata as últimas mensagens como transcript "cliente:/você:". */
async function buildTranscript(leadId: string, limit = 50): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_messages")
    .select("direction, body, media_type, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (data ?? []).reverse();
  return rows
    .map((m) => {
      const who = m.direction === "in" ? "cliente" : "você";
      const body = m.body ?? (m.media_type ? `[${m.media_type}]` : "");
      return body ? `${who}: ${body}` : null;
    })
    .filter(Boolean)
    .join("\n");
}

/** Analisa a conversa e grava ai_score / pain_summary / approach_suggestion. */
export async function analyzeLead(leadId: string) {
  if (!aiConfigured()) return { error: NOT_CONFIGURED };
  const supabase = await createClient();

  // RLS decide se o usuário pode ver/editar este lead
  const { data: lead } = await supabase
    .from("leads")
    .select("id, name, source, value, stage:pipeline_stages(name)")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { error: "Lead não encontrado." };

  const transcript = await buildTranscript(leadId);
  if (!transcript) {
    return { error: "Esse lead ainda não tem conversa pra analisar." };
  }

  try {
    const a = await analyzeConversation({
      leadName: lead.name,
      source: String(lead.source ?? ""),
      stage:
        (lead.stage as unknown as { name: string } | null)?.name ?? null,
      value: Number(lead.value ?? 0),
      transcript,
    });

    const { error } = await supabase
      .from("leads")
      .update({
        ai_score: a.ai_score,
        pain_summary: a.pain_summary,
        approach_suggestion: a.approach_suggestion,
      })
      .eq("id", leadId);
    if (error) return { error: error.message };

    revalidatePath("/crm/leads/[id]", "page");
    revalidatePath("/crm");
    return { ok: true, analysis: a };
  } catch (e) {
    return { error: `IA falhou: ${(e as Error).message}` };
  }
}

/** Gera um rascunho de resposta pro composer do inbox. */
export async function suggestReply(leadId: string) {
  if (!aiConfigured()) return { error: NOT_CONFIGURED };
  const supabase = await createClient();
  const profile = await getProfile();

  const { data: lead } = await supabase
    .from("leads")
    .select("id, name")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { error: "Lead não encontrado." };

  const transcript = await buildTranscript(leadId, 30);
  if (!transcript) return { error: "Sem conversa ainda — escreva a primeira você mesmo." };

  const { data: pbs } = await supabase
    .from("playbooks")
    .select("title, content")
    .limit(6);
  const playbooks = (pbs ?? [])
    .map((p) => `## ${p.title}\n${p.content}`)
    .join("\n\n")
    .slice(0, 6000);

  try {
    const text = await draftReply({
      leadName: lead.name,
      userName: profile.name.split(" ")[0] || profile.name,
      transcript,
      playbooks,
    });
    if (!text) return { error: "A IA não devolveu texto — tente de novo." };
    return { ok: true, text };
  } catch (e) {
    return { error: `IA falhou: ${(e as Error).message}` };
  }
}
