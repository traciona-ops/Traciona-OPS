-- =============================================================
-- 0013 — Slug "code" em pipelines e pipeline_stages
-- UUID continua sendo o PK (segurança/integridade). O `code` é um
-- identificador legível (ex.: 'vendas', 'novo-lead') alimentado pelo nome.
-- Único globalmente em pipelines; único por pipeline em pipeline_stages.
-- =============================================================

create or replace function public.slugify(input text)
returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(
    lower(translate(coalesce(input, ''),
      'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')),
    '[^a-z0-9]+', '-', 'g'))
$$;

-- ---- pipelines ----
alter table pipelines add column if not exists code text;

with ranked as (
  select id, nullif(public.slugify(name), '') as base,
    row_number() over (partition by public.slugify(name) order by created_at) - 1 as rn
  from pipelines
)
update pipelines p set code =
  case when r.rn = 0 then coalesce(r.base, 'pipeline')
       else coalesce(r.base, 'pipeline') || '-' || (r.rn + 1)::text end
from ranked r where p.id = r.id and p.code is null;

alter table pipelines alter column code set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pipelines_code_key') then
    alter table pipelines add constraint pipelines_code_key unique (code);
  end if;
end $$;

-- ---- pipeline_stages (único por pipeline) ----
alter table pipeline_stages add column if not exists code text;

with ranked as (
  select id, pipeline_id, nullif(public.slugify(name), '') as base,
    row_number() over (partition by pipeline_id, public.slugify(name) order by position) - 1 as rn
  from pipeline_stages
)
update pipeline_stages s set code =
  case when r.rn = 0 then coalesce(r.base, 'etapa')
       else coalesce(r.base, 'etapa') || '-' || (r.rn + 1)::text end
from ranked r where s.id = r.id and s.code is null;

alter table pipeline_stages alter column code set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pipeline_stages_pipeline_code_key') then
    alter table pipeline_stages add constraint pipeline_stages_pipeline_code_key unique (pipeline_id, code);
  end if;
end $$;
