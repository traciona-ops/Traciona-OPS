-- =============================================================
-- 0018 — Busca de leads por nome OU número (respeita RLS do usuário)
-- SECURITY INVOKER (padrão) → a RLS de leads filtra pelo papel/setor de quem
-- chama. Casa por: nome (ilike), dígitos parciais do telefone, e número
-- canônico (variações de DDI / 9º dígito).
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
      regexp_replace(coalesce(q, ''), '\D', '', 'g') as digits
  )
  select l.id, l.name, l.phone, l.avatar_url, l.pipeline_id, p.name, s.name
  from leads l
  left join pipelines p on p.id = l.pipeline_id
  left join pipeline_stages s on s.id = l.stage_id,
  qq
  where qq.raw <> ''
    and (
      l.name ilike '%' || qq.raw || '%'
      or (length(qq.digits) >= 4
          and regexp_replace(coalesce(l.phone, ''), '\D', '', 'g') like '%' || qq.digits || '%')
      or (length(qq.digits) >= 8
          and public.canonical_phone(l.phone) = public.canonical_phone(qq.digits))
    )
  order by l.updated_at desc
  limit 15
$$;

grant execute on function public.search_leads(text) to authenticated;
