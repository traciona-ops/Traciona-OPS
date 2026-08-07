-- =============================================================
-- 0020 — Canal de Sucesso do Cliente (CS)
--   * flag is_cs em pipelines (separa "clientes ativos" de "potenciais")
--   * funil "Sucesso do Cliente" com etapas de CS
--   * trigger: lead que chega numa etapa "Ganho" (is_won) de um funil de
--     VENDAS é promovido automaticamente pro funil de CS (Onboarding).
-- =============================================================

alter table pipelines add column if not exists is_cs boolean not null default false;

-- Cria o funil de CS + etapas (idempotente)
do $$
declare
  v_pid uuid;
  v_pos int;
begin
  select id into v_pid from pipelines where is_cs = true limit 1;
  if v_pid is null then
    select coalesce(max(position), -1) + 1 into v_pos from pipelines;
    insert into pipelines (code, name, type, color, position, is_cs)
    values ('sucesso-do-cliente', 'Sucesso do Cliente', 'custom', '#0ca678', v_pos, true)
    returning id into v_pid;

    insert into pipeline_stages (pipeline_id, code, name, position, color, sla_days) values
      (v_pid, 'onboarding',  'Onboarding',  0, '#1d6fff', 7),
      (v_pid, 'ativo',       'Ativo',       1, '#0ca678', null),
      (v_pid, 'renovacao',   'Renovação',   2, '#fbbf24', 30),
      (v_pid, 'em-risco',    'Em risco',    3, '#f59e0b', 3),
      (v_pid, 'churn',       'Churn',       4, '#e5484d', null);
  end if;
end $$;

-- Trigger: promove pro CS ao ganhar a venda
create or replace function public.promote_won_to_cs()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_won boolean;
  v_src_is_cs boolean;
  v_cs_pipeline uuid;
  v_cs_stage uuid;
  v_pos int;
begin
  if new.stage_id is distinct from old.stage_id and new.stage_id is not null then
    select s.is_won, coalesce(p.is_cs, false)
      into v_is_won, v_src_is_cs
      from pipeline_stages s
      join pipelines p on p.id = s.pipeline_id
      where s.id = new.stage_id;

    -- só promove se foi pra uma etapa GANHO de um funil que NÃO é de CS
    if v_is_won and not v_src_is_cs then
      select id into v_cs_pipeline
        from pipelines where is_cs = true and archived = false
        order by position limit 1;
      if v_cs_pipeline is not null then
        select id into v_cs_stage
          from pipeline_stages where pipeline_id = v_cs_pipeline
          order by position limit 1;
        if v_cs_stage is not null then
          select coalesce(min(position), 1) - 1 into v_pos
            from leads where stage_id = v_cs_stage;
          new.pipeline_id := v_cs_pipeline;
          new.stage_id := v_cs_stage;
          new.stage_changed_at := now();
          new.position := v_pos;
        end if;
      end if;
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists trg_promote_won_to_cs on leads;
create trigger trg_promote_won_to_cs
  before update on leads
  for each row execute function public.promote_won_to_cs();
