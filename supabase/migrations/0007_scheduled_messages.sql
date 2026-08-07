-- =============================================================
-- 0007 — Mensagens agendadas (enviar depois)
-- =============================================================

create table if not exists scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  body text not null,
  send_at timestamptz not null,
  status text not null default 'pending', -- pending | processing | sent | failed | canceled
  error text,
  sent_message_id uuid references whatsapp_messages(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists idx_sched_due
  on scheduled_messages (status, send_at);
create index if not exists idx_sched_lead
  on scheduled_messages (lead_id);

alter table scheduled_messages enable row level security;

do $$
begin
  execute 'drop policy if exists "auth_read" on scheduled_messages';
  execute 'create policy "auth_read" on scheduled_messages for select to authenticated using (true)';
  execute 'drop policy if exists "auth_write" on scheduled_messages';
  execute 'create policy "auth_write" on scheduled_messages for insert to authenticated with check (true)';
  execute 'drop policy if exists "auth_update" on scheduled_messages';
  execute 'create policy "auth_update" on scheduled_messages for update to authenticated using (true) with check (true)';
  execute 'drop policy if exists "auth_delete" on scheduled_messages';
  execute 'create policy "auth_delete" on scheduled_messages for delete to authenticated using (true)';
end $$;
