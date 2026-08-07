-- =============================================================
-- 0004 — WhatsApp: não lidas (read_at) + Realtime
-- =============================================================

alter table whatsapp_messages
  add column if not exists read_at timestamptz;

create index if not exists idx_wa_unread
  on whatsapp_messages(lead_id)
  where direction = 'in' and read_at is null;

-- Habilita Realtime (postgres_changes) na tabela de mensagens
do $$
begin
  alter publication supabase_realtime add table whatsapp_messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
