-- =============================================================
-- 0051 — Amplia inbox_sessions: closed / mine / all
-- Tabs do shell GronerZap: Aguardando | Em atendimento | Encerradas | Minhas | Todas
-- =============================================================

create or replace function public.inbox_sessions(p_tab text default 'waiting')
returns table (
  session_id uuid,
  lead_id uuid,
  name text,
  phone text,
  sector text,
  avatar_url text,
  status text,
  assignee_id uuid,
  assignee_name text,
  queue_id uuid,
  queue_name text,
  routing_reason text,
  created_at timestamptz,
  assigned_at timestamptz,
  last_body text,
  last_at timestamptz,
  last_direction text,
  unread bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select s.*
    from chat_sessions s
    where case p_tab
      when 'active' then s.status = 'active'::chat_session_status
      when 'paused' then s.status = 'paused'::chat_session_status
      when 'closed' then s.status = 'closed'::chat_session_status
      when 'mine' then
        s.status in ('active'::chat_session_status, 'paused'::chat_session_status)
        and s.assignee_id = auth.uid()
      when 'all' then
        s.status in (
          'waiting'::chat_session_status,
          'active'::chat_session_status,
          'paused'::chat_session_status
        )
      else s.status = 'waiting'::chat_session_status
    end
      and (
        p_tab <> 'closed'
        or s.closed_at > now() - interval '30 days'
      )
  ),
  last_msg as (
    select distinct on (m.lead_id)
      m.lead_id, m.body, m.created_at, m.direction
    from whatsapp_messages m
    where m.lead_id in (select lead_id from scoped)
    order by m.lead_id, m.created_at desc
  ),
  unread as (
    select m.lead_id, count(*) as c
    from whatsapp_messages m
    where m.direction = 'in'
      and m.read_at is null
      and m.lead_id in (select lead_id from scoped)
    group by m.lead_id
  )
  select
    s.id,
    l.id,
    l.name,
    l.phone,
    l.sector::text,
    l.avatar_url,
    s.status::text,
    s.assignee_id,
    pr.name,
    s.queue_id,
    q.name,
    s.routing_reason,
    s.created_at,
    s.assigned_at,
    lm.body,
    coalesce(lm.created_at, s.created_at),
    lm.direction,
    coalesce(u.c, 0)
  from scoped s
  join leads l on l.id = s.lead_id
  left join chat_queues q on q.id = s.queue_id
  left join profiles pr on pr.id = s.assignee_id
  left join last_msg lm on lm.lead_id = l.id
  left join unread u on u.lead_id = l.id
  where public.can_see_lead(l.id)
     or public.my_role() = 'admin'
     or s.assignee_id = auth.uid()
     or (s.status = 'waiting' and (
          q.sector is null
          or q.sector = public.my_sector()
          or public.my_role() in ('admin', 'gestor')
        ))
     or (p_tab = 'closed' and (
          s.assignee_id = auth.uid()
          or public.my_role() in ('admin', 'gestor')
        ))
  order by
    case when p_tab = 'waiting' then s.created_at end asc,
    case when p_tab = 'closed' then s.closed_at end desc nulls last,
    case when p_tab not in ('waiting', 'closed') then coalesce(lm.created_at, s.created_at) end desc
$$;

grant execute on function public.inbox_sessions(text) to authenticated;
