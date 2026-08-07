-- =============================================================
-- 0003 — Tarefas avulsas (sem lead) + categoria
-- =============================================================

-- Permite tarefa sem vínculo a lead (tarefa operacional/avulsa)
alter table lead_tasks alter column lead_id drop not null;

-- Categoria da tarefa (operacional / comercial / marketing / produto / outro)
alter table lead_tasks add column if not exists category text;
