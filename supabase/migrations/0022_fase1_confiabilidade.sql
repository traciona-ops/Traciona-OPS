-- =============================================================
-- 0022 — Fase 1: confiabilidade de dados
--   1) leads.won_at / lost_at  → data REAL do ganho/perda (KPIs corretos)
--   2) pipelines.is_default    → funil de entrada do webhook configurável
--      (antes: "primeiro por position" — reordenar funis mudava o destino)
--   3) RLS: vendedor VÊ leads sem dono do seu setor (e pode assumir)
--   4) lead_stage_history      → trilha de quem moveu o quê e quando
--   5) scheduled_messages: attempts + claimed_at (retry e resgate no cron)
--   6) RPC inbox_conversations() → lista de conversas completa (sem janela)
--   7) RPC reorder_leads()       → reindex de posições em 1 UPDATE
-- =============================================================

-- ---------- 1) won_at / lost_at ----------
alter table leads add column if not exists won_at timestamptz;
alter table leads add column if not exists lost_at timestamptz;

-- Backfill: quem está em etapa ganha/perdida ou já foi promovido pro CS
update leads l set won_at = coalesce(l.won_at, l.stage_changed_at)
from pipeline_stages s
where s.id = l.stage_id and s.is_won and l.won_at is null;

update leads l set lost_at = coalesce(l.lost_at, l.stage_changed_at)
from pipeline_stages s
where s.id = l.stage_id and s.is_lost and l.lost_at is null;

update leads l set won_at = coalesce(l.won_at, l.stage_changed_at)
from pipelines p
where p.id = l.pipeline_id and p.is_cs and l.won_at is null;

-- O trigger de promoção pro CS agora também carimba won_at/lost_at.
-- (ponto único: pega movimento manual, updateLead e automações)
create or replace function public.promote_won_to_cs()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_won boolean;
  v_is_lost boolean;
  v_src_is_cs boolean;
  v_cs_pipeline uuid;
  v_cs_stage uuid;
  v_pos int;
begin
  if new.stage_id is distinct from old.stage_id and new.stage_id is not null then
    select s.is_won, s.is_lost, coalesce(p.is_cs, false)
      into v_is_won, v_is_lost, v_src_is_cs
      from pipeline_stages s
      join pipelines p on p.id = s.pipeline_id
      where s.id = new.stage_id;

    if v_is_won and not v_src_is_cs then
      new.won_at := now();
      select id into v_cs_pipeline
        from pipelines where is_cs = true and archived = false
        order by position limit 1;
      if v_cs_pipeline is not null then
        select id into v_cs_stage
          from pipeline_stages where pipeline_id = v_cs_pipeline
          order by position limit 1;
        if v_cs_stage is not null then
          select coalesce(min(position), 1) - 1 into v_pos
            from leads where stage_id = v_cs_stage;
          new.pipeline_id := v_cs_pipeline;
          new.stage_id := v_cs_stage;
          new.stage_changed_at := now();
          new.position := v_pos;
        end if;
      end if;
    elsif v_is_lost then
      new.lost_at := now();
    end if;
  end if;
  return new;
end
$$;

-- ---------- 2) funil de entrada configurável ----------
alter table pipelines add column if not exists is_default boolean not null default false;

-- marca o primeiro funil NÃO-CS como padrão (estado atual preservado)
update pipelines set is_default = true
where id = (
  select id from pipelines
  where archived = false and coalesce(is_cs, false) = false
  order by position limit 1
)
and not exists (select 1 from pipelines where is_default);

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

  -- funil padrão de entrada; NUNCA cai num funil de CS
  select id into v_pipeline
    from pipelines
   where archived = false and coalesce(is_cs, false) = false
   order by is_default desc, position
   limit 1;
  if v_pipeline is null then
    return null;
  end if;
  select id into v_stage
    from pipeline_stages where pipeline_id = v_pipeline order by position limit 1;
  if v_stage is null then
    return null;
  end if;

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

-- ---------- 3) vendedor vê (e pode assumir) leads sem dono do setor ----------
create or replace function public.can_see_lead(lid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.leads l
    where l.id = lid and (
      public.my_role() = 'admin'
      or (l.sector = public.my_sector()
          and (public.my_role() = 'gestor' or l.owner_id = auth.uid() or l.owner_id is null))
    )
  )
$$;

drop policy if exists leads_select on leads;
drop policy if exists leads_update on leads;
create policy leads_select on leads for select to authenticated using (
  public.my_role() = 'admin'
  or (sector = public.my_sector()
      and (public.my_role() = 'gestor' or owner_id = auth.uid() or owner_id is null))
);
create policy leads_update on leads for update to authenticated
using (
  public.my_role() = 'admin'
  or (sector = public.my_sector()
      and (public.my_role() = 'gestor' or owner_id = auth.uid() or owner_id is null))
)
with check (
  public.my_role() = 'admin'
  or (sector = public.my_sector()
      and (public.my_role() = 'gestor' or owner_id = auth.uid() or owner_id is null))
);

-- ---------- 4) histórico de etapas ----------
create table if not exists lead_stage_history (
  id bigint generated always as identity primary key,
  lead_id uuid not null references leads(id) on delete cascade,
  from_stage_id uuid references pipeline_stages(id) on delete set null,
  to_stage_id uuid references pipeline_stages(id) on delete set null,
  moved_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_stage_history_lead on lead_stage_history(lead_id);

alter table lead_stage_history enable row level security;
drop policy if exists stage_history_select on lead_stage_history;
create policy stage_history_select on lead_stage_history for select to authenticated
  using (public.my_role() = 'admin' or public.can_see_lead(lead_id));

create or replace function public.log_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.stage_id is distinct from old.stage_id then
    insert into lead_stage_history (lead_id, from_stage_id, to_stage_id, moved_by)
    values (new.id, old.stage_id, new.stage_id, auth.uid());
  end if;
  return new;
end
$$;

drop trigger if exists trg_log_stage_change on leads;
create trigger trg_log_stage_change
  after update on leads
  for each row execute function public.log_stage_change();

-- ---------- 5) retry/resgate de mensagens agendadas ----------
alter table scheduled_messages add column if not exists attempts int not null default 0;
alter table scheduled_messages add column if not exists claimed_at timestamptz;

-- ---------- 6) lista de conversas SEM janela de 400 mensagens ----------
-- SECURITY INVOKER: a RLS de whatsapp_messages/leads se aplica normalmente.
create or replace function public.inbox_conversations()
returns table (
  lead_id uuid,
  name text,
  phone text,
  sector text,
  avatar_url text,
  is_client boolean,
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
         coalesce(p.is_cs, false), lm.body, lm.created_at, lm.direction,
         lm.media_type, coalesce(u.c, 0)
  from last_msg lm
  join leads l on l.id = lm.lead_id
  left join pipelines p on p.id = l.pipeline_id
  left join unread u on u.lead_id = lm.lead_id
  order by lm.created_at desc
$$;
grant execute on function public.inbox_conversations() to authenticated;

-- ---------- 7) reindex de posições em 1 UPDATE ----------
create or replace function public.reorder_leads(p_ids uuid[])
returns void
language sql
as $$
  update leads l set position = t.ord - 1
  from unnest(p_ids) with ordinality as t(id, ord)
  where l.id = t.id;
$$;
grant execute on function public.reorder_leads(uuid[]) to authenticated;
