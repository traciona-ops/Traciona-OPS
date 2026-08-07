-- =============================================================
-- 0014 — Índice único parcial em whatsapp_messages.provider_msg_id
-- Necessário pra idempotência dos imports de histórico (HistorySync
-- pode trazer a mesma mensagem mais de uma vez; o upsert depende disso).
-- =============================================================

create unique index if not exists ux_wa_provider_msg_id
  on whatsapp_messages(provider_msg_id)
  where provider_msg_id is not null;
