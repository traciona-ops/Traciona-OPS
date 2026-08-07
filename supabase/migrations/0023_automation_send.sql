-- =============================================================
-- 0023 — Automações: ação "enviar WhatsApp" + gatilho "entrou na etapa"
--   * automations.message_body → template da mensagem ({nome}, {saudacao})
--   * automation_runs → trava de 1 disparo por lead por automação
--     (sem isso, um gatilho de estado tipo "sem resposta há X dias"
--      dispararia a MESMA mensagem a cada minuto do cron)
-- =============================================================

alter table automations add column if not exists message_body text;

create table if not exists automation_runs (
  automation_id uuid not null references automations(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (automation_id, lead_id)
);

alter table automation_runs enable row level security;
drop policy if exists automation_runs_select on automation_runs;
create policy automation_runs_select on automation_runs for select to authenticated
  using (public.my_role() in ('admin','gestor'));
