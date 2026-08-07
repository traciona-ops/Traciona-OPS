-- =============================================================
-- 0019 — Lead novo do WhatsApp entra no TOPO da etapa (menor position)
-- Atualiza wa_find_or_create_lead pra definir position = min(position)-1.
-- =============================================================

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
  v_pos int;
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

  -- topo da etapa
  select coalesce(min(position), 1) - 1 into v_pos
    from leads where stage_id = v_stage;

  begin
    insert into leads (name, phone, source, sector, pipeline_id, stage_id, owner_id, position)
    values (
      coalesce(nullif(p_name, ''), p_phone),
      p_phone, 'whatsapp', p_sector, v_pipeline, v_stage, null, v_pos
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
