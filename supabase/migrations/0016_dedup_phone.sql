-- =============================================================
-- 0016 — Deduplicação de leads por telefone (impossível duplicar)
--   1) canonical_phone(): normaliza número BR (remove DDI 55 e o 9º dígito)
--      → mesma chave pra "5511999998888", "551199998888", "11999998888".
--   2) índice ÚNICO no canonical → o banco recusa duplicata (mesmo em corrida).
--   3) wa_find_or_create_lead(): acha-ou-cria atômico (trata a corrida).
-- =============================================================

create or replace function public.canonical_phone(input text)
returns text language sql immutable as $$
  select nullif(
    right(
      case
        when length(t.y) = 11 and substr(t.y, 3, 1) = '9'
          then substr(t.y, 1, 2) || substr(t.y, 4)   -- tira o 9º dígito
        else t.y
      end,
      10
    ),
    ''
  )
  from (
    select case
      when length(d.x) >= 12 and left(d.x, 2) = '55' then substr(d.x, 3)  -- tira DDI
      else d.x
    end as y
    from (select regexp_replace(coalesce(input, ''), '\D', '', 'g') as x) d
  ) t
$$;

-- Índice único no número canônico (só pra quem tem telefone)
create unique index if not exists ux_leads_canonical_phone
  on leads (public.canonical_phone(phone))
  where phone is not null and phone <> '';

-- Acha-ou-cria atômico. Em corrida, o índice único garante 1 só; o perdedor
-- cai no exception e devolve o lead que ganhou.
create or replace function public.wa_find_or_create_lead(
  p_phone text,
  p_name text default '',
  p_sector text default 'vendas'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text := public.canonical_phone(p_phone);
  v_id uuid;
  v_pipeline uuid;
  v_stage uuid;
begin
  if v_key is null then
    return null;
  end if;

  select id into v_id
    from leads
   where phone is not null and public.canonical_phone(phone) = v_key
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select id into v_pipeline
    from pipelines where archived = false order by position limit 1;
  if v_pipeline is null then
    return null;
  end if;
  select id into v_stage
    from pipeline_stages where pipeline_id = v_pipeline order by position limit 1;
  if v_stage is null then
    return null;
  end if;

  begin
    insert into leads (name, phone, source, sector, pipeline_id, stage_id, owner_id)
    values (
      coalesce(nullif(p_name, ''), p_phone),
      p_phone, 'whatsapp', p_sector, v_pipeline, v_stage, null
    )
    returning id into v_id;
    return v_id;
  exception when unique_violation then
    select id into v_id
      from leads
     where phone is not null and public.canonical_phone(phone) = v_key
     limit 1;
    return v_id;
  end;
end
$$;

revoke all on function public.wa_find_or_create_lead(text, text, text) from public;
grant execute on function public.wa_find_or_create_lead(text, text, text) to service_role;
