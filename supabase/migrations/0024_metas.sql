-- =============================================================
-- 0024 — Meta mensal de faturamento
--   1 linha por mês ("2026-07"). O dashboard mostra % da meta.
-- =============================================================

create table if not exists org_goals (
  month text primary key,           -- "YYYY-MM"
  revenue_target numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table org_goals enable row level security;
drop policy if exists goals_select on org_goals;
drop policy if exists goals_write on org_goals;
create policy goals_select on org_goals for select to authenticated using (true);
create policy goals_write on org_goals for all to authenticated
  using (public.my_role() in ('admin','gestor'))
  with check (public.my_role() in ('admin','gestor'));
