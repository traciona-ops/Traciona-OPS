import type {
  AutomationAction,
  AutomationTrigger,
  LeadSource,
  Sector,
  TaskCategory,
  TaskPriority,
  TaskStatus,
} from "@/lib/types";

/**
 * Rótulos e cores das listas fixas do sistema — é CONTEÚDO, não regra: mudar
 * um texto ou uma cor aqui não muda comportamento nenhum. As cores saem da
 * mesma paleta dos tokens; ao trocar, confira o contraste nos dois temas.
 */

export const SECTOR: Record<Sector, { label: string; color: string }> = {
  vendas: { label: "Vendas", color: "#1d6fff" },
  suporte: { label: "Suporte", color: "#00c16a" },
  financeiro: { label: "Financeiro", color: "#f59e0b" },
};

export const SOURCE_LABEL: Record<LeadSource, string> = {
  meta_ads: "Meta Ads",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  manual: "Manual",
  referral: "Indicação",
  organic: "Orgânico",
};

export const TASK_STATUS: Record<TaskStatus, { label: string; color: string }> = {
  a_fazer: { label: "A fazer", color: "#8b9bb4" },
  em_andamento: { label: "Em andamento", color: "#1d6fff" },
  concluida: { label: "Concluída", color: "#0ca678" },
};

export const TASK_PRIORITY: Record<TaskPriority, { label: string; color: string }> = {
  urgente: { label: "Urgente", color: "#e5484d" },
  alta: { label: "Alta", color: "#f59e0b" },
  normal: { label: "Normal", color: "#1d6fff" },
  baixa: { label: "Baixa", color: "#8b9bb4" },
};

export const TASK_CATEGORY: Record<TaskCategory, { label: string; color: string }> = {
  ligacao: { label: "Ligação", color: "#1d6fff" },
  whatsapp: { label: "WhatsApp", color: "#00c16a" },
  email: { label: "E-mail", color: "#a78bfa" },
  reuniao: { label: "Reunião", color: "#f59e0b" },
  followup: { label: "Follow-up", color: "#00b8d4" },
  visita: { label: "Visita", color: "#f472b6" },
  tarefa: { label: "Tarefa", color: "#8b9bb4" },
};

export const AUTOMATION_TRIGGER: Record<
  AutomationTrigger,
  { label: string; needsDays: boolean; event: boolean }
> = {
  enter_stage: { label: "Card entrou na etapa", needsDays: false, event: false },
  stale_days: { label: "Card parado há", needsDays: true, event: false },
  reply_received: { label: "Cliente respondeu", needsDays: false, event: true },
  no_reply_days: { label: "Sem resposta há", needsDays: true, event: false },
};

export const AUTOMATION_ACTION: Record<AutomationAction, string> = {
  move_stage: "Mover o card",
  send_message: "Enviar WhatsApp",
};
