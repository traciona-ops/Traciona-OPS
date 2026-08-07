-- =============================================================
-- 0030 — Tarefas estilo ClickUp
--   status:   a_fazer | em_andamento | concluida  (quadro kanban)
--   priority: urgente | alta | normal | baixa     (bandeirinhas)
--   `done` continua existindo (compatibilidade) — o app mantém em sincronia.
-- =============================================================

alter table lead_tasks add column if not exists status text not null default 'a_fazer';
alter table lead_tasks add column if not exists priority text not null default 'normal';

-- backfill: concluídas viram status 'concluida'
update lead_tasks set status = 'concluida' where done = true and status <> 'concluida';

create index if not exists idx_tasks_status on lead_tasks(status);
