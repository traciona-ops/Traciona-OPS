import Anthropic from "@anthropic-ai/sdk";

// IA do sistema (server-only). Usa Haiku 4.5 — barato e rápido, suficiente
// pra resumo de conversa e rascunho de resposta. Troque via env AI_MODEL.

const MODEL = process.env.AI_MODEL || "claude-haiku-4-5";

export function aiConfigured(): boolean {
  const k = process.env.ANTHROPIC_API_KEY ?? "";
  return k.startsWith("sk-ant-");
}

function client() {
  return new Anthropic();
}

export interface LeadAnalysis {
  ai_score: number;
  pain_summary: string;
  approach_suggestion: string;
}

const ANALYSIS_SCHEMA = {
  type: "object" as const,
  properties: {
    ai_score: {
      type: "integer",
      description: "0 a 100: quão quente está esse lead (chance de fechar)",
    },
    pain_summary: {
      type: "string",
      description:
        "Resumo em 1-3 frases da dor/necessidade do lead, em português",
    },
    approach_suggestion: {
      type: "string",
      description:
        "Sugestão prática de abordagem pro vendedor (próximo passo), em português",
    },
  },
  required: ["ai_score", "pain_summary", "approach_suggestion"],
  additionalProperties: false,
};

/** Analisa a conversa do lead → score + dor + abordagem (JSON garantido). */
export async function analyzeConversation(input: {
  leadName: string;
  source: string;
  stage: string | null;
  value: number;
  transcript: string; // mensagens formatadas "cliente:/você:"
}): Promise<LeadAnalysis> {
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 2048,
    system:
      "Você é analista comercial de uma agência brasileira de marketing e IA. " +
      "Analise a conversa de WhatsApp entre a agência e o lead. Seja direto e " +
      "prático; escreva em português do Brasil.",
    messages: [
      {
        role: "user",
        content: `Lead: ${input.leadName} · Origem: ${input.source} · Etapa: ${
          input.stage ?? "—"
        } · Valor estimado: R$ ${input.value}

Conversa (mais antiga → mais recente):
${input.transcript || "(sem mensagens ainda)"}

Avalie o lead.`,
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: ANALYSIS_SCHEMA,
      },
    },
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
  const parsed = JSON.parse(text) as LeadAnalysis;
  // clamp defensivo (schema não valida min/max)
  parsed.ai_score = Math.max(0, Math.min(100, Math.round(parsed.ai_score)));
  return parsed;
}

/** Rascunho de resposta pro inbox, com base na conversa + playbooks. */
export async function draftReply(input: {
  leadName: string;
  userName: string;
  transcript: string;
  playbooks: string; // títulos + conteúdos concatenados (pode ser vazio)
}): Promise<string> {
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system:
      "Você escreve rascunhos de resposta de WhatsApp para uma agência brasileira " +
      "de marketing e IA. Tom: humano, direto, cordial, sem formalidade excessiva. " +
      "Responda APENAS com o texto da mensagem (sem aspas, sem explicações). " +
      "Mensagem curta como se escreve no WhatsApp (1-4 frases). " +
      (input.playbooks
        ? `Use os playbooks da agência quando fizer sentido:\n${input.playbooks}`
        : ""),
    messages: [
      {
        role: "user",
        content: `Conversa com ${input.leadName} (mais antiga → mais recente):
${input.transcript}

Escreva a próxima mensagem que ${input.userName} deve mandar.`,
      },
    ],
  });

  return response.content.find((b) => b.type === "text")?.text?.trim() ?? "";
}
