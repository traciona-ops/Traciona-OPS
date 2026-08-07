-- =============================================================
-- 0032 — Índices de performance pros caminhos quentes
-- inbox_conversations faz DISTINCT ON por lead ordenado por data, e o
-- badge conta não-lidas a cada evento — sem índice isso vira scan
-- completo conforme whatsapp_messages cresce.
-- =============================================================

-- lista de conversas / thread da conversa (lead + ordem cronológica)
create index if not exists idx_wa_msgs_lead_created
  on public.whatsapp_messages (lead_id, created_at desc);

-- contador de não-lidas (parcial: só o que interessa)
create index if not exists idx_wa_msgs_unread
  on public.whatsapp_messages (lead_id)
  where direction = 'in' and read_at is null;

-- board por funil
create index if not exists idx_leads_pipeline
  on public.leads (pipeline_id)
  where pipeline_id is not null;

-- funil de conversão dos dashboards (varre por período)
create index if not exists idx_stage_history_created
  on public.lead_stage_history (created_at);
