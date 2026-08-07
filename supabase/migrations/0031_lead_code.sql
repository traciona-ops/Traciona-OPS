-- =============================================================
-- 0031 — Código curto do lead (#42): identificação por número
-- Negócio e contato são o mesmo registro (leads), então um código
-- único identifica os dois. Lead novo (formulário, WhatsApp, chat)
-- nasce numerado pela sequência; os existentes são numerados por
-- ordem de criação. Código nunca é reciclado.
-- =============================================================

create sequence if not exists public.lead_code_seq;

alter table public.leads add column if not exists code bigint;

-- Backfill por ordem de chegada (1, 2, 3, ...)
with numbered as (
  select id, row_number() over (order by created_at, id) as rn
  from public.leads
  where code is null
),
base as (select coalesce(max(code), 0) as m from public.leads)
update public.leads l
set code = b.m + n.rn
from numbered n, base b
where l.id = n.id;

create unique index if not exists leads_code_key on public.leads(code);

select setval(
  'public.lead_code_seq',
  coalesce((select max(code) from public.leads), 0) + 1,
  false
);

alter table public.leads
  alter column code set default nextval('public.lead_code_seq');

-- Rede de segurança: numera qualquer lead que tenha entrado sem código
-- na janela entre o backfill e o default.
update public.leads
set code = nextval('public.lead_code_seq')
where code is null;

-- Busca global: nome, telefone (parcial/canônico) e agora o código exato
-- (o usuário pode digitar "42" ou "#42" — só os dígitos são comparados).
drop function if exists public.search_leads(text);
create function public.search_leads(q text)
returns table (
  id uuid,
  code bigint,
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
  select l.id, l.code, l.name, l.phone, l.avatar_url, l.pipeline_id, p.name, s.name
  from leads l
  left join pipelines p on p.id = l.pipeline_id
  left join pipeline_stages s on s.id = l.stage_id,
  qq
  where qq.raw <> ''
    and (
      l.name ilike '%' || qq.raw || '%'
      or (qq.digits <> '' and l.code::text = qq.digits)
      or (length(qq.digits) >= 4
          and regexp_replace(coalesce(l.phone, ''), '\D', '', 'g') like '%' || qq.digits || '%')
      or (length(qq.digits) >= 8
          and public.canonical_phone(l.phone) = public.canonical_phone(qq.digits))
    )
  -- código exato primeiro, depois os mais recentes
  order by (qq.digits <> '' and l.code::text = qq.digits) desc, l.updated_at desc
  limit 15
$$;

grant execute on function public.search_leads(text) to authenticated;
