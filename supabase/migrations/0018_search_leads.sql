-- =============================================================
-- 0018 — Busca de leads por nome OU número (respeita RLS do usuário)
-- SECURITY INVOKER (padrão) → a RLS de leads filtra pelo papel/setor de quem
-- chama. Casa por: full-text search em name_normalized + email + company,
-- e dígitos parciais do telefone com número canônico.
--
-- A partir de 0048: usa denormalized search_text (tsvector) via GIN index,
-- muito mais rápido que ILIKE em texto livre.
-- =============================================================

create or replace function public.search_leads(q text)
returns table (
  id uuid,
  name text,
  phone text,
  avatar_url text,
  pipeline_id uuid,
  pipeline text,
  stage text
)
language sql
stable
as $$
  with qq as (
    select
      trim(coalesce(q, '')) as raw,
      regexp_replace(coalesce(q, ''), '\D', '', 'g') as digits,
      plainto_tsquery('portuguese', trim(coalesce(q, ''))) as ts_query
  )
  select l.id, l.name, l.phone, l.avatar_url, l.pipeline_id, p.name, s.name
  from leads l
  left join pipelines p on p.id = l.pipeline_id
  left join pipeline_stages s on s.id = l.stage_id,
  qq
  where qq.raw <> ''
    and (
      -- Full-text search via denormalized search_text (requires 0048 migration)
      (l.search_text @@ qq.ts_query)
      -- Fallback: partial phone digit matching for edge cases
      or (length(qq.digits) >= 4
          and regexp_replace(coalesce(l.phone, ''), '\D', '', 'g') like '%' || qq.digits || '%')
      -- Fallback: canonical phone matching
      or (length(qq.digits) >= 8
          and public.canonical_phone(l.phone) = public.canonical_phone(qq.digits))
    )
  order by l.updated_at desc
  limit 15
$$;

grant execute on function public.search_leads(text) to authenticated;
