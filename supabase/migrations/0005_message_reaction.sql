-- =============================================================
-- 0005 — Reação (emoji) na mensagem de WhatsApp
-- =============================================================

alter table whatsapp_messages
  add column if not exists reaction text;
