-- =============================================================
-- 0051 — Sessões de atendimento (híbrido CRM timeline + helpdesk)
-- Overlay em cima de whatsapp_messages: histórico do lead continua
-- infinito; chat_sessions marca episódios com fila/SLA/encerramento.
-- Flag: org_settings.chat.sessions_enabled (default false).
-- =============================================================

-- ---------- enums ----------
do $$ begin
  create type public.chat_session_status as enum (
    'waiting', 'active', 'paused', 'closed'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.chat_queue_mode as enum ('pull', 'acd');
exception when duplicate_object then null;
end $$;

-- ---------- filas ----------
create table if not exists public.chat_queues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sector text check (sector is null or sector in ('vendas', 'suporte', 'financeiro')),
  mode public.chat_queue_mode not null default 'pull',
  sla_first_response_seconds int not null default 300,
  sla_resolution_seconds int,
  business_hours jsonb not null default '{
    "tz":"America/Sao_Paulo",
    "days":{
      "1":[["09:00","18:00"]],
      "2":[["09:00","18:00"]],
      "3":[["09:00","18:00"]],
      "4":[["09:00","18:00"]],
      "5":[["09:00","18:00"]]
    },
    "holidays":[]
  }'::jsonb,
  csat_enabled boolean not null default false,
  csat_delay_seconds int not null default 60,
  vip_bypass boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.chat_queues (name, sector, mode)
select v.name, v.sector, 'pull'::public.chat_queue_mode
from (values
  ('Comercial', 'vendas'),
  ('Suporte', 'suporte'),
  ('Financeiro', 'financeiro')
) as v(name, sector)
where not exists (
  select 1 from public.chat_queues q where q.sector = v.sector
);

-- ---------- presença do operador (ACD) ----------
create table if not exists public.agent_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'offline'
    check (status in ('online', 'busy', 'away', 'offline')),
  max_concurrent int not null default 5,
  updated_at timestamptz not null default now()
);

-- ---------- sessões ----------
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  queue_id uuid references public.chat_queues(id) on delete set null,
  number_id uuid references public.wa_numbers(id) on delete set null,
  status public.chat_session_status not null default 'waiting',
  assignee_id uuid references public.profiles(id) on delete set null,
  opened_by text not null default 'inbound'
    check (opened_by in ('inbound', 'outbound', 'manual', 'vip')),
  created_at timestamptz not null default now(),
  assigned_at timestamptz,
  first_agent_reply_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null,
  close_reason text,
  wait_seconds int,
  handle_seconds int,
  paused_seconds int not null default 0,
  routing_reason text,
  deal_id uuid,
  csat_score smallint check (csat_score between 1 and 5),
  csat_comment text,
  csat_sent_at timestamptz,
  csat_answered_at timestamptz,
  csat_due_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists chat_sessions_one_open_per_lead
  on public.chat_sessions (lead_id)
  where status in ('waiting', 'active', 'paused');

create index if not exists chat_sessions_queue_status
  on public.chat_sessions (queue_id, status, created_at)
  where status <> 'closed';

create index if not exists chat_sessions_assignee_status
  on public.chat_sessions (assignee_id, status)
  where assignee_id is not null and status <> 'closed';

create index if not exists chat_sessions_lead
  on public.chat_sessions (lead_id, created_at desc);

-- ---------- pausas (desconto de SLA) ----------
create table if not exists public.chat_session_pauses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  reason text
);
create index if not exists chat_session_pauses_session
  on public.chat_session_pauses (session_id, started_at);

-- ---------- eventos (auditoria) ----------
create table if not exists public.chat_session_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  kind text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists chat_session_events_session
  on public.chat_session_events (session_id, created_at);

-- ---------- vínculo opcional na mensagem ----------
alter table public.whatsapp_messages
  add column if not exists session_id uuid
    references public.chat_sessions(id) on delete set null;

create index if not exists idx_wa_session
  on public.whatsapp_messages (session_id, created_at)
  where session_id is not null;

-- ---------- flag no org_settings ----------
update public.org_settings
set value = coalesce(value, '{}'::jsonb) || jsonb_build_object(
  'sessions_enabled', false,
  'vip_stage_names', '["Proposta"]'::jsonb
)
where key = 'chat'
  and not (value ? 'sessions_enabled');

-- ---------- RPC atômica: garantir sessão aberta ----------
create or replace function public.ensure_open_chat_session(
  p_lead_id uuid,
  p_queue_id uuid default null,
  p_number_id uuid default null,
  p_opened_by text default 'inbound',
  p_assignee_id uuid default null,
  p_status public.chat_session_status default 'waiting',
  p_routing_reason text default 'queue'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_status public.chat_session_status;
begin
  select id, status into v_id, v_status
  from public.chat_sessions
  where lead_id = p_lead_id
    and status in ('waiting', 'active', 'paused')
  for update;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.chat_sessions (
    lead_id, queue_id, number_id, status, assignee_id,
    opened_by, assigned_at, routing_reason
  ) values (
    p_lead_id,
    p_queue_id,
    p_number_id,
    p_status,
    p_assignee_id,
    coalesce(p_opened_by, 'inbound'),
    case when p_assignee_id is not null then now() else null end,
    p_routing_reason
  )
  returning id into v_id;

  insert into public.chat_session_events (session_id, kind, payload)
  values (
    v_id,
    'opened',
    jsonb_build_object(
      'opened_by', coalesce(p_opened_by, 'inbound'),
      'routing_reason', p_routing_reason,
      'status', p_status
    )
  );

  return v_id;
exception
  when unique_violation then
    select id into v_id
    from public.chat_sessions
    where lead_id = p_lead_id
      and status in ('waiting', 'active', 'paused')
    limit 1;
    return v_id;
end;
$$;

revoke all on function public.ensure_open_chat_session(
  uuid, uuid, uuid, text, uuid, public.chat_session_status, text
) from public;
grant execute on function public.ensure_open_chat_session(
  uuid, uuid, uuid, text, uuid, public.chat_session_status, text
) to service_role;

-- ---------- lista de sessões (filas) ----------
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
  with open_sessions as (
    select s.*
    from chat_sessions s
    where s.status = case p_tab
      when 'active' then 'active'::chat_session_status
      when 'paused' then 'paused'::chat_session_status
      else 'waiting'::chat_session_status
    end
  ),
  last_msg as (
    select distinct on (m.lead_id)
      m.lead_id, m.body, m.created_at, m.direction
    from whatsapp_messages m
    where m.lead_id in (select lead_id from open_sessions)
    order by m.lead_id, m.created_at desc
  ),
  unread as (
    select m.lead_id, count(*) as c
    from whatsapp_messages m
    where m.direction = 'in'
      and m.read_at is null
      and m.lead_id in (select lead_id from open_sessions)
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
  from open_sessions s
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
  order by
    case when p_tab = 'waiting' then s.created_at end asc,
    case when p_tab <> 'waiting' then coalesce(lm.created_at, s.created_at) end desc
$$;

grant execute on function public.inbox_sessions(text) to authenticated;

-- ---------- RLS ----------
alter table public.chat_queues enable row level security;
alter table public.agent_presence enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_session_pauses enable row level security;
alter table public.chat_session_events enable row level security;

drop policy if exists chat_queues_select on public.chat_queues;
create policy chat_queues_select on public.chat_queues
  for select to authenticated using (true);

drop policy if exists chat_queues_write on public.chat_queues;
create policy chat_queues_write on public.chat_queues
  for all to authenticated
  using (public.my_role() in ('admin', 'gestor'))
  with check (public.my_role() in ('admin', 'gestor'));

drop policy if exists agent_presence_select on public.agent_presence;
create policy agent_presence_select on public.agent_presence
  for select to authenticated using (true);

drop policy if exists agent_presence_upsert on public.agent_presence;
create policy agent_presence_upsert on public.agent_presence
  for all to authenticated
  using (
    user_id = auth.uid()
    or public.my_role() in ('admin', 'gestor')
  )
  with check (
    user_id = auth.uid()
    or public.my_role() in ('admin', 'gestor')
  );

drop policy if exists chat_sessions_select on public.chat_sessions;
create policy chat_sessions_select on public.chat_sessions
  for select to authenticated
  using (
    public.my_role() = 'admin'
    or public.can_see_lead(lead_id)
    or assignee_id = auth.uid()
    or status = 'waiting'
  );

drop policy if exists chat_sessions_insert on public.chat_sessions;
create policy chat_sessions_insert on public.chat_sessions
  for insert to authenticated
  with check (
    public.my_role() in ('admin', 'gestor')
    or public.can_see_lead(lead_id)
  );

drop policy if exists chat_sessions_update on public.chat_sessions;
create policy chat_sessions_update on public.chat_sessions
  for update to authenticated
  using (
    public.my_role() in ('admin', 'gestor')
    or assignee_id = auth.uid()
    or status = 'waiting'
    or public.can_see_lead(lead_id)
  )
  with check (
    public.my_role() in ('admin', 'gestor')
    or assignee_id = auth.uid()
    or public.can_see_lead(lead_id)
  );

drop policy if exists chat_session_pauses_select on public.chat_session_pauses;
create policy chat_session_pauses_select on public.chat_session_pauses
  for select to authenticated
  using (
    exists (
      select 1 from public.chat_sessions s
      where s.id = session_id
        and (
          public.my_role() = 'admin'
          or public.can_see_lead(s.lead_id)
          or s.assignee_id = auth.uid()
        )
    )
  );

drop policy if exists chat_session_pauses_write on public.chat_session_pauses;
create policy chat_session_pauses_write on public.chat_session_pauses
  for all to authenticated
  using (
    exists (
      select 1 from public.chat_sessions s
      where s.id = session_id
        and (
          public.my_role() in ('admin', 'gestor')
          or s.assignee_id = auth.uid()
        )
    )
  )
  with check (
    exists (
      select 1 from public.chat_sessions s
      where s.id = session_id
        and (
          public.my_role() in ('admin', 'gestor')
          or s.assignee_id = auth.uid()
        )
    )
  );

drop policy if exists chat_session_events_select on public.chat_session_events;
create policy chat_session_events_select on public.chat_session_events
  for select to authenticated
  using (
    exists (
      select 1 from public.chat_sessions s
      where s.id = session_id
        and (
          public.my_role() = 'admin'
          or public.can_see_lead(s.lead_id)
          or s.assignee_id = auth.uid()
        )
    )
  );

drop policy if exists chat_session_events_insert on public.chat_session_events;
create policy chat_session_events_insert on public.chat_session_events
  for insert to authenticated
  with check (
    exists (
      select 1 from public.chat_sessions s
      where s.id = session_id
        and (
          public.my_role() in ('admin', 'gestor')
          or s.assignee_id = auth.uid()
          or s.status = 'waiting'
        )
    )
  );

-- Realtime para a sidebar de filas
do $$ begin
  alter publication supabase_realtime add table public.chat_sessions;
exception when duplicate_object then null;
end $$;
