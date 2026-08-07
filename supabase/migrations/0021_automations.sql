-- =============================================================
-- 0021 — Automações de movimentação de card (motor de regras)
--   Regra = na ETAPA (gatilho), quando [trigger], então [action].
--   Fase 1:
--     trigger 'stale_days'      → card parado N dias na etapa
--     trigger 'reply_received'  → cliente respondeu (mensagem in)
--     trigger 'no_reply_days'   → sem resposta do cliente há N dias
--   Ação fase 1: 'move_stage' (move pra to_stage_id).
-- =============================================================

create table if not exists automations (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  stage_id uuid references pipeline_stages(id) on delete cascade,  -- etapa gatilho
  name text,
  trigger text not null,                 -- stale_days | reply_received | no_reply_days
  trigger_days int,                      -- p/ stale_days / no_reply_days
  action text not null default 'move_stage',
  to_stage_id uuid references pipeline_stages(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_automations_stage on automations(stage_id) where active;
create index if not exists idx_automations_pipeline on automations(pipeline_id);

alter table automations enable row level security;

-- Gestor/admin gerenciam; qualquer autenticado pode ler (o app precisa listar).
drop policy if exists automations_select on automations;
drop policy if exists automations_write on automations;
create policy automations_select on automations for select to authenticated using (true);
create policy automations_write on automations for all to authenticated
  using (public.my_role() in ('admin','gestor'))
  with check (public.my_role() in ('admin','gestor'));
