-- =============================================================
-- 0028 — Card no funil é OPCIONAL (chat primeiro)
--   * Mensagem recebida de número novo cria só o CONTATO (lead sem
--     pipeline/etapa) → aparece no chat, mas NÃO no kanban.
--   * Botão "Adicionar ao funil" coloca no pipeline quando o usuário quiser.
--   * inbox_conversations() ganha in_pipeline pro chat indicar quem está fora.
-- =============================================================

-- 1) wa_find_or_create_lead: cria SEM pipeline/etapa
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

  begin
    insert into leads (name, phone, source, sector, pipeline_id, stage_id, owner_id)
    values (
      coalesce(nullif(p_name, ''), p_phone),
      p_phone, 'whatsapp', p_sector, null, null, null
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

-- 2) inbox_conversations com in_pipeline
drop function if exists public.inbox_conversations();

create function public.inbox_conversations()
returns table (
  lead_id uuid,
  name text,
  phone text,
  sector text,
  avatar_url text,
  is_client boolean,
  in_pipeline boolean,
  owner_id uuid,
  owner_name text,
  last_body text,
  last_at timestamptz,
  last_direction text,
  last_media_type text,
  unread bigint
)
language sql stable
as $$
  with last_msg as (
    select distinct on (m.lead_id)
      m.lead_id, m.body, m.created_at, m.direction, m.media_type
    from whatsapp_messages m
    order by m.lead_id, m.created_at desc
  ),
  unread as (
    select m.lead_id, count(*) as c
    from whatsapp_messages m
    where m.direction = 'in' and m.read_at is null
    group by m.lead_id
  )
  select l.id, l.name, l.phone, l.sector, l.avatar_url,
         coalesce(p.is_cs, false), l.pipeline_id is not null,
         l.owner_id, pr.name,
         lm.body, lm.created_at, lm.direction,
         lm.media_type, coalesce(u.c, 0)
  from last_msg lm
  join leads l on l.id = lm.lead_id
  left join pipelines p on p.id = l.pipeline_id
  left join profiles pr on pr.id = l.owner_id
  left join unread u on u.lead_id = lm.lead_id
  order by lm.created_at desc
$$;

grant execute on function public.inbox_conversations() to authenticated;
