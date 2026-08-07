-- =============================================================
-- 0027 — inbox_conversations() passa a devolver o RESPONSÁVEL
--   (owner_id + owner_name) pro filtro por responsável do chat.
--   Return type muda → precisa dropar e recriar.
-- =============================================================

drop function if exists public.inbox_conversations();

create function public.inbox_conversations()
returns table (
  lead_id uuid,
  name text,
  phone text,
  sector text,
  avatar_url text,
  is_client boolean,
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
         coalesce(p.is_cs, false), l.owner_id, pr.name,
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
