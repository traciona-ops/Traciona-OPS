-- =============================================================
-- 0029 — Configurações do número (chat)
--   value jsonb:
--     signature        boolean → assina "— Nome" no fim de cada envio manual
--     auto_create_card boolean → mensagem recebida já cria card no funil
--                                (false = padrão chat-first: só contato)
-- =============================================================

create table if not exists org_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into org_settings (key, value)
values ('chat', '{"signature": false, "auto_create_card": false}'::jsonb)
on conflict (key) do nothing;

alter table org_settings enable row level security;
drop policy if exists org_settings_select on org_settings;
drop policy if exists org_settings_write on org_settings;
create policy org_settings_select on org_settings
  for select to authenticated using (true);
create policy org_settings_write on org_settings
  for all to authenticated
  using (public.my_role() in ('admin','gestor'))
  with check (public.my_role() in ('admin','gestor'));
