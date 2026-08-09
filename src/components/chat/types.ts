import type {
  Lead,
  LeadNote,
  LeadTag,
  LeadTask,
  Meeting,
  PipelineStage,
  Profile,
  ScheduledMessage,
  Sector,
  WhatsappMessage,
} from "@/lib/types";

/** Uma linha da lista de conversas (vem da RPC `inbox_conversations`). */
export type Conv = {
  lead_id: string;
  name: string;
  phone: string | null;
  sector: Sector;
  avatar_url: string | null;
  is_client: boolean;
  in_pipeline: boolean;
  owner_id: string | null;
  owner_name: string | null;
  last_body: string | null;
  last_at: string;
  last_direction: "in" | "out";
  last_media_type: string | null;
  number_id: string | null;
  unread: number;
};

/** Número de WhatsApp conectável (multi-número). */
export type WaNumberRow = {
  id: string;
  name: string;
  jid: string | null;
  env_default: boolean;
};

/** Número no seletor da lista (só o que o chat precisa saber). */
export type ChatNumber = { id: string; name: string; env_default: boolean };

/** Filtros da lista de conversas. */
export type ConvFilters = {
  search: string;
  sector: Sector | "todos";
  /** "todos" | "meus" | "none" | <userId> */
  owner: string;
  /** "todos" | "principal" | <numberId> */
  number: string;
};

/** Tudo que o painel lateral do lead precisa (lead + listas relacionadas). */
export type LeadContext = {
  lead: Lead & { tags: LeadTag[]; owner: Profile | null };
  stages: PipelineStage[];
  team: Profile[];
  tasks: (LeadTask & { assignee?: { name: string } })[];
  notes: (LeadNote & { author?: { name: string } })[];
  meetings: Meeting[];
  scheduled: ScheduledMessage[];
};

export type ChatMessage = WhatsappMessage;

/** Dados mínimos do contato usados pelo cabeçalho e pelo composer. */
export type ChatLead = {
  id: string;
  name: string;
  phone: string | null;
  avatar_url: string | null;
};
