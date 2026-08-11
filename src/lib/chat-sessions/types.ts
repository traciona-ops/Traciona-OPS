import type { Sector } from "@/lib/types";

export type ChatSessionStatus = "waiting" | "active" | "paused" | "closed";
export type ChatQueueMode = "pull" | "acd";
export type SessionOpenedBy = "inbound" | "outbound" | "manual" | "vip";

export type ChatQueue = {
  id: string;
  name: string;
  sector: Sector | null;
  mode: ChatQueueMode;
  sla_first_response_seconds: number;
  sla_resolution_seconds: number | null;
  csat_enabled: boolean;
  csat_delay_seconds: number;
  vip_bypass: boolean;
  active: boolean;
};

export type ChatSession = {
  id: string;
  lead_id: string;
  queue_id: string | null;
  number_id: string | null;
  status: ChatSessionStatus;
  assignee_id: string | null;
  opened_by: SessionOpenedBy;
  created_at: string;
  assigned_at: string | null;
  first_agent_reply_at: string | null;
  closed_at: string | null;
  closed_by: string | null;
  close_reason: string | null;
  wait_seconds: number | null;
  handle_seconds: number | null;
  paused_seconds: number;
  routing_reason: string | null;
  csat_due_at: string | null;
};

/** Linha da RPC inbox_sessions. */
export type InboxSessionRow = {
  session_id: string;
  lead_id: string;
  name: string;
  phone: string | null;
  sector: Sector;
  avatar_url: string | null;
  status: ChatSessionStatus;
  assignee_id: string | null;
  assignee_name: string | null;
  queue_id: string | null;
  queue_name: string | null;
  routing_reason: string | null;
  created_at: string;
  assigned_at: string | null;
  last_body: string | null;
  last_at: string;
  last_direction: "in" | "out" | null;
  unread: number;
};

export type QueueTab = "waiting" | "active" | "paused";
