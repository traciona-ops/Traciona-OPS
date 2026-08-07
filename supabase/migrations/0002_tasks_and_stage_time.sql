-- =============================================================
-- 0002 — Tempo no estágio (SLA) + Tarefas do lead
-- =============================================================

-- ---------- Tempo no estágio ----------
alter table leads
  add column if not exists stage_changed_at timestamptz not null default now();

-- Backfill: usa o created_at como ponto de partida nos leads existentes
update leads set stage_changed_at = created_at where stage_changed_at is null;

-- ---------- SLA por estágio (regra de prazo) ----------
alter table pipeline_stages
  add column if not exists sla_days int;

-- Default: 3 dias de prazo nos estágios ativos (não-ganho/não-perdido).
-- Ajustável depois por estágio.
update pipeline_stages
  set sla_days = 3
  where sla_days is null and is_won = false and is_lost = false;

-- ---------- Tarefas do lead ----------
create table if not exists lead_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  title text not null,
  assignee_id uuid references profiles(id) on delete set null,
  due_date date,
  done boolean not null default false,
  completed_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_tasks_lead on lead_tasks(lead_id);
create index if not exists idx_tasks_assignee on lead_tasks(assignee_id);

alter table lead_tasks enable row level security;

do $$
begin
  execute 'drop policy if exists "auth_read" on lead_tasks';
  execute 'create policy "auth_read" on lead_tasks for select to authenticated using (true)';
  execute 'drop policy if exists "auth_write" on lead_tasks';
  execute 'create policy "auth_write" on lead_tasks for insert to authenticated with check (true)';
  execute 'drop policy if exists "auth_update" on lead_tasks';
  execute 'create policy "auth_update" on lead_tasks for update to authenticated using (true) with check (true)';
  execute 'drop policy if exists "auth_delete" on lead_tasks';
  execute 'create policy "auth_delete" on lead_tasks for delete to authenticated using (true)';
end $$;
