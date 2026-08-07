export type UserRole = "admin" | "gestor" | "vendedor";
export type PipelineType =
  | "sales"
  | "followup"
  | "instagram"
  | "social"
  | "custom";
export type LeadSource =
  | "meta_ads"
  | "instagram"
  | "whatsapp"
  | "manual"
  | "referral"
  | "organic";
export type MessageDirection = "in" | "out";
export type PlaybookType = "sales" | "objection" | "product";

export type Sector = "vendas" | "suporte" | "financeiro";
export const SECTOR: Record<Sector, { label: string; color: string }> = {
  vendas: { label: "Vendas", color: "#1d6fff" },
  suporte: { label: "Suporte", color: "#00c16a" },
  financeiro: { label: "Financeiro", color: "#f59e0b" },
};

export interface Profile {
  id: string;
  name: string;
  email: string | null;
  role: UserRole;
  sector: Sector;
  avatar_url: string | null;
  phone: string | null;
  active: boolean;
  created_at: string;
}

export interface Pipeline {
  id: string;
  code: string;
  name: string;
  type: PipelineType;
  color: string;
  position: number;
  archived: boolean;
  is_cs: boolean;
  is_default: boolean;
  created_at: string;
}

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  code: string;
  name: string;
  position: number;
  color: string;
  is_won: boolean;
  is_lost: boolean;
  sla_days: number | null;
  created_at: string;
}

export interface Lead {
  id: string;
  /** Código curto sequencial (#42) — identificação humana do negócio/contato */
  code: number | null;
  name: string;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  company: string | null;
  source: LeadSource;
  pipeline_id: string | null;
  stage_id: string | null;
  owner_id: string | null;
  sector: Sector;
  value: number;
  avatar_url: string | null;
  pain_summary: string | null;
  approach_suggestion: string | null;
  ai_score: number | null;
  meta_lead_id: string | null;
  last_contact_at: string | null;
  stage_changed_at: string;
  won_at: string | null;
  lost_at: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

// Tipos de atividade (estilo CRM). Coluna `category` é texto livre.
export type TaskCategory =
  | "ligacao"
  | "whatsapp"
  | "email"
  | "reuniao"
  | "followup"
  | "visita"
  | "tarefa";

export type TaskStatus = "a_fazer" | "em_andamento" | "concluida";
export type TaskPriority = "urgente" | "alta" | "normal" | "baixa";

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

export interface LeadTask {
  id: string;
  lead_id: string | null;
  title: string;
  assignee_id: string | null;
  due_date: string | null;
  done: boolean;
  completed_at: string | null;
  category: TaskCategory | null;
  status: TaskStatus;
  priority: TaskPriority;
  created_by: string | null;
  created_at: string;
}

export const TASK_CATEGORY: Record<TaskCategory, { label: string; color: string }> = {
  ligacao: { label: "Ligação", color: "#1d6fff" },
  whatsapp: { label: "WhatsApp", color: "#00c16a" },
  email: { label: "E-mail", color: "#a78bfa" },
  reuniao: { label: "Reunião", color: "#f59e0b" },
  followup: { label: "Follow-up", color: "#00b8d4" },
  visita: { label: "Visita", color: "#f472b6" },
  tarefa: { label: "Tarefa", color: "#8b9bb4" },
};

export interface LeadNote {
  id: string;
  lead_id: string;
  author_id: string | null;
  content: string;
  audio_url: string | null;
  created_at: string;
}

export interface LeadTransfer {
  id: string;
  lead_id: string;
  from_user: string | null;
  to_user: string | null;
  reason: string | null;
  created_at: string;
}

export interface LeadTag {
  id: string;
  lead_id: string;
  tag: string;
  color: string;
}

export interface WhatsappMessage {
  id: string;
  lead_id: string;
  direction: MessageDirection;
  body: string | null;
  media_url: string | null;
  media_type: string | null;
  status: string;
  provider: string | null;
  provider_msg_id: string | null;
  sent_by: string | null;
  read_at: string | null;
  reaction: string | null;
  /** Citação (responder mensagem): trecho e autor ('in'/'out') da citada */
  reply_to_body?: string | null;
  reply_to_dir?: string | null;
  created_at: string;
}

export type ScheduledStatus =
  | "pending"
  | "processing"
  | "sent"
  | "failed"
  | "canceled";

export interface ScheduledMessage {
  id: string;
  lead_id: string;
  body: string;
  send_at: string;
  status: ScheduledStatus;
  error: string | null;
  sent_message_id: string | null;
  created_by: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface Playbook {
  id: string;
  type: PlaybookType;
  title: string;
  content: string;
  position: number;
  created_at: string;
}

export interface QuickReply {
  id: string;
  shortcut: string | null;
  title: string;
  content: string;
  position: number;
  created_at: string;
}

// ---------- Automações (movimentação de card + envio de mensagem) ----------
export type AutomationTrigger =
  | "stale_days" // card parado N dias na etapa
  | "reply_received" // cliente respondeu (mensagem in)
  | "no_reply_days" // sem resposta do cliente há N dias
  | "enter_stage"; // card entrou na etapa (1x por lead)

export type AutomationAction = "move_stage" | "send_message";

export interface Automation {
  id: string;
  pipeline_id: string;
  stage_id: string | null;
  name: string | null;
  trigger: AutomationTrigger;
  trigger_days: number | null;
  action: AutomationAction;
  to_stage_id: string | null;
  message_body: string | null;
  active: boolean;
  created_at: string;
}

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

export interface Meeting {
  id: string;
  lead_id: string | null;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  meet_url: string | null;
  google_event_id: string | null;
  location: string | null;
  transcript: string | null;
  ai_task_suggestions: unknown;
  created_by: string | null;
  created_at: string;
}

// Convenience composites
export interface LeadWithRelations extends Lead {
  owner: Profile | null;
  tags: LeadTag[];
}

export interface PipelineWithStages extends Pipeline {
  stages: PipelineStage[];
}

export const SOURCE_LABEL: Record<LeadSource, string> = {
  meta_ads: "Meta Ads",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  manual: "Manual",
  referral: "Indicação",
  organic: "Orgânico",
};
