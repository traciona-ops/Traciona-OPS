-- =============================================================
-- 0026 — Estado do sistema (monitor de conexão do WhatsApp)
--   O cron grava o status da instância a cada minuto; o app mostra
--   banner vermelho + notificação quando cai. Escrita só via service
--   role (sem policy de write); leitura pra qualquer autenticado.
-- =============================================================

create table if not exists system_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table system_state enable row level security;
drop policy if exists system_state_select on system_state;
create policy system_state_select on system_state
  for select to authenticated using (true);

-- realtime: o banner reage na hora que o status muda
do $$
begin
  alter publication supabase_realtime add table system_state;
exception when duplicate_object then
  null;
when undefined_object then
  null;
end $$;
