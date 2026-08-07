-- ============================================================
-- SETUP COMPLETO — Traciona Eco Sistema (rode tudo de uma vez)
-- ============================================================

-- =============================================================
-- Traciona Eco Sistema — Schema inicial (Fase 1: CRM + Pipelines)
-- =============================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";

-- ---------- Enums ----------
do $$ begin
  create type user_role as enum ('admin', 'sales', 'ops');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pipeline_type as enum ('sales', 'followup', 'instagram', 'social', 'custom');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_source as enum ('meta_ads', 'instagram', 'whatsapp', 'manual', 'referral', 'organic');
exception when duplicate_object then null; end $$;

do $$ begin
  create type message_direction as enum ('in', 'out');
exception when duplicate_object then null; end $$;

do $$ begin
  create type playbook_type as enum ('sales', 'objection', 'product');
exception when duplicate_object then null; end $$;

-- ---------- updated_at trigger helper ----------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------- profiles ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text,
  role user_role not null default 'sales',
  avatar_url text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Auto-create profile when a user signs up
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- pipelines ----------
create table if not exists pipelines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type pipeline_type not null default 'custom',
  color text not null default '#6d5efc',
  position int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- pipeline_stages ----------
create table if not exists pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  name text not null,
  position int not null default 0,
  color text not null default '#5b6478',
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_stages_pipeline on pipeline_stages(pipeline_id);

-- ---------- leads ----------
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  instagram text,
  company text,
  source lead_source not null default 'manual',
  pipeline_id uuid references pipelines(id) on delete set null,
  stage_id uuid references pipeline_stages(id) on delete set null,
  owner_id uuid references profiles(id) on delete set null,
  value numeric(12,2) not null default 0,
  pain_summary text,
  approach_suggestion text,
  ai_score int,
  meta_lead_id text,
  last_contact_at timestamptz,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_leads_pipeline on leads(pipeline_id);
create index if not exists idx_leads_stage on leads(stage_id);
create index if not exists idx_leads_owner on leads(owner_id);

drop trigger if exists trg_leads_updated_at on leads;
create trigger trg_leads_updated_at
  before update on leads
  for each row execute function set_updated_at();

-- ---------- lead_notes ----------
create table if not exists lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  content text not null default '',
  audio_url text,
  created_at timestamptz not null default now()
);
create index if not exists idx_notes_lead on lead_notes(lead_id);

-- ---------- lead_transfers ----------
create table if not exists lead_transfers (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  from_user uuid references profiles(id) on delete set null,
  to_user uuid references profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists idx_transfers_lead on lead_transfers(lead_id);

-- ---------- lead_tags ----------
create table if not exists lead_tags (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  tag text not null,
  color text not null default '#6d5efc'
);
create index if not exists idx_tags_lead on lead_tags(lead_id);

-- ---------- whatsapp_messages ----------
create table if not exists whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  direction message_direction not null,
  body text,
  media_url text,
  media_type text,
  status text not null default 'sent',
  provider text,
  provider_msg_id text,
  sent_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_wa_lead on whatsapp_messages(lead_id);

-- ---------- playbooks ----------
create table if not exists playbooks (
  id uuid primary key default gen_random_uuid(),
  type playbook_type not null default 'sales',
  title text not null,
  content text not null default '',
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- meetings ----------
create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete set null,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  meet_url text,
  google_event_id text,
  location text,
  transcript text,
  ai_task_suggestions jsonb,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_meetings_lead on meetings(lead_id);
create index if not exists idx_meetings_starts on meetings(starts_at);

-- =============================================================
-- Row Level Security
-- Single-tenant: qualquer membro autenticado da equipe pode operar.
-- (Visibilidade por dono/role pode ser refinada em fase posterior.)
-- =============================================================

alter table profiles            enable row level security;
alter table pipelines           enable row level security;
alter table pipeline_stages     enable row level security;
alter table leads               enable row level security;
alter table lead_notes          enable row level security;
alter table lead_transfers      enable row level security;
alter table lead_tags           enable row level security;
alter table whatsapp_messages   enable row level security;
alter table playbooks           enable row level security;
alter table meetings            enable row level security;

-- Helper: aplica policy "authenticated full access" em uma tabela
do $$
declare
  t text;
  tables text[] := array[
    'profiles','pipelines','pipeline_stages','leads','lead_notes',
    'lead_transfers','lead_tags','whatsapp_messages','playbooks','meetings'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists "auth_read" on %I', t);
    execute format(
      'create policy "auth_read" on %I for select to authenticated using (true)', t);
    execute format('drop policy if exists "auth_write" on %I', t);
    execute format(
      'create policy "auth_write" on %I for insert to authenticated with check (true)', t);
    execute format('drop policy if exists "auth_update" on %I', t);
    execute format(
      'create policy "auth_update" on %I for update to authenticated using (true) with check (true)', t);
    execute format('drop policy if exists "auth_delete" on %I', t);
    execute format(
      'create policy "auth_delete" on %I for delete to authenticated using (true)', t);
  end loop;
end $$;


-- =============================================================
-- Seed — pipelines, estágios e leads de exemplo
-- Roda só se ainda não houver pipelines (idempotente para dev).
-- =============================================================

do $$
declare
  p_vendas uuid;
  p_followup uuid;
  p_instagram uuid;
  p_social uuid;
  s_novo uuid;
  s_qualif uuid;
  s_reuniao uuid;
  s_proposta uuid;
begin
  if exists (select 1 from pipelines) then
    raise notice 'Pipelines já existem — seed ignorado.';
    return;
  end if;

  -- Pipelines
  insert into pipelines (name, type, color, position)
    values ('Vendas', 'sales', '#6d5efc', 0) returning id into p_vendas;
  insert into pipelines (name, type, color, position)
    values ('Follow-up', 'followup', '#38bdf8', 1) returning id into p_followup;
  insert into pipelines (name, type, color, position)
    values ('Instagram', 'instagram', '#f472b6', 2) returning id into p_instagram;
  insert into pipelines (name, type, color, position)
    values ('Social', 'social', '#34d399', 3) returning id into p_social;

  -- Estágios — Vendas
  insert into pipeline_stages (pipeline_id, name, position, color) values
    (p_vendas, 'Novo Lead', 0, '#8a93a6') returning id into s_novo;
  insert into pipeline_stages (pipeline_id, name, position, color) values
    (p_vendas, 'Qualificação', 1, '#38bdf8') returning id into s_qualif;
  insert into pipeline_stages (pipeline_id, name, position, color) values
    (p_vendas, 'Reunião Agendada', 2, '#6d5efc') returning id into s_reuniao;
  insert into pipeline_stages (pipeline_id, name, position, color) values
    (p_vendas, 'Proposta', 3, '#fbbf24') returning id into s_proposta;
  insert into pipeline_stages (pipeline_id, name, position, color) values
    (p_vendas, 'Negociação', 4, '#f59e0b');
  insert into pipeline_stages (pipeline_id, name, position, color, is_won) values
    (p_vendas, 'Ganho', 5, '#34d399', true);
  insert into pipeline_stages (pipeline_id, name, position, color, is_lost) values
    (p_vendas, 'Perdido', 6, '#f87171', true);

  -- Estágios — Follow-up
  insert into pipeline_stages (pipeline_id, name, position, color) values
    (p_followup, 'Aguardando Retorno', 0, '#8a93a6'),
    (p_followup, 'Reengajar', 1, '#fbbf24'),
    (p_followup, 'Reativado', 2, '#34d399');
  insert into pipeline_stages (pipeline_id, name, position, color, is_lost) values
    (p_followup, 'Descartado', 3, '#f87171', true);

  -- Estágios — Instagram
  insert into pipeline_stages (pipeline_id, name, position, color) values
    (p_instagram, 'DM Recebida', 0, '#8a93a6'),
    (p_instagram, 'Em Conversa', 1, '#38bdf8'),
    (p_instagram, 'Qualificado', 2, '#6d5efc');
  insert into pipeline_stages (pipeline_id, name, position, color, is_won) values
    (p_instagram, 'Enviado p/ Vendas', 3, '#34d399', true);

  -- Estágios — Social
  insert into pipeline_stages (pipeline_id, name, position, color) values
    (p_social, 'Comentário', 0, '#8a93a6'),
    (p_social, 'DM', 1, '#38bdf8'),
    (p_social, 'Interessado', 2, '#6d5efc');
  insert into pipeline_stages (pipeline_id, name, position, color, is_won) values
    (p_social, 'Convertido', 3, '#34d399', true);

  -- Leads de exemplo (pipeline Vendas)
  insert into leads (name, phone, email, company, source, pipeline_id, stage_id, value, position) values
    ('Ana Beatriz Souza', '5511991234567', 'ana@lojadaana.com', 'Loja da Ana', 'meta_ads', p_vendas, s_novo, 4500, 0),
    ('Carlos Menezes', '5511987654321', 'carlos@menezesadv.com', 'Menezes Advocacia', 'instagram', p_vendas, s_novo, 8000, 1),
    ('Juliana Prado', '5521996541230', 'ju@pradoestetica.com', 'Prado Estética', 'meta_ads', p_vendas, s_qualif, 6200, 0),
    ('Rafael Lima', '5511970001122', 'rafa@limafit.com', 'Lima Fit', 'referral', p_vendas, s_reuniao, 12000, 0),
    ('Marina Costa', '5511960002233', 'marina@costadoces.com', 'Costa Doces', 'organic', p_vendas, s_proposta, 3500, 0);

  raise notice 'Seed concluído.';
end $$;
