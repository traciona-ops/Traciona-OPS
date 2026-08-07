-- Setor Operações & Projetos (agência): Onboarding (OPS Forms), Briefings
-- & Solicitações e Biblioteca de Prompts & IA.

-- ============ 1) ONBOARDING (formulário público com token + autosave) ======
create table if not exists onboarding_requests (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  lead_id uuid references leads(id) on delete set null,
  client_name text not null default '',
  status text not null default 'pendente'
    check (status in ('pendente','em_andamento','respondido','cancelado')),
  answers jsonb not null default '{}'::jsonb,
  assets jsonb not null default '[]'::jsonb,
  current_step int not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  answered_at timestamptz
);
create index if not exists onboarding_requests_status_idx on onboarding_requests(status);
alter table onboarding_requests enable row level security;
do $$ begin
  execute 'create policy "auth_all" on onboarding_requests for all to authenticated using (true) with check (true)';
exception when duplicate_object then null; end $$;

-- ============ 2) BRIEFINGS & SOLICITAÇÕES ==================================
create table if not exists briefings (
  id uuid primary key default gen_random_uuid(),
  code serial,
  title text not null,
  kind text not null default 'arte'
    check (kind in ('arte','video','copy','campanha','site','outro')),
  priority text not null default 'media'
    check (priority in ('baixa','media','alta','urgente')),
  status text not null default 'aberto'
    check (status in ('aberto','em_andamento','aguardando_aprovacao','aprovado','concluido','arquivado')),
  description_html text not null default '',
  lead_id uuid references leads(id) on delete set null,
  requester_id uuid references profiles(id) on delete set null,
  assignee_id uuid references profiles(id) on delete set null,
  due_date date,
  refs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists briefings_status_idx on briefings(status);
alter table briefings enable row level security;
do $$ begin
  execute 'create policy "auth_all" on briefings for all to authenticated using (true) with check (true)';
exception when duplicate_object then null; end $$;

create table if not exists briefing_comments (
  id uuid primary key default gen_random_uuid(),
  briefing_id uuid not null references briefings(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  kind text not null default 'comentario'
    check (kind in ('comentario','aprovacao','ajuste')),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists briefing_comments_briefing_idx on briefing_comments(briefing_id);
alter table briefing_comments enable row level security;
do $$ begin
  execute 'create policy "auth_all" on briefing_comments for all to authenticated using (true) with check (true)';
exception when duplicate_object then null; end $$;

-- ============ 3) BIBLIOTECA DE PROMPTS & IA ================================
create table if not exists prompt_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
alter table prompt_folders enable row level security;
do $$ begin
  execute 'create policy "auth_all" on prompt_folders for all to authenticated using (true) with check (true)';
exception when duplicate_object then null; end $$;

create table if not exists prompts (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references prompt_folders(id) on delete set null,
  title text not null,
  content text not null default '',
  updated_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prompts_folder_idx on prompts(folder_id);
alter table prompts enable row level security;
do $$ begin
  execute 'create policy "auth_all" on prompts for all to authenticated using (true) with check (true)';
exception when duplicate_object then null; end $$;

create table if not exists prompt_versions (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references prompts(id) on delete cascade,
  content text not null,
  author_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists prompt_versions_prompt_idx on prompt_versions(prompt_id);
alter table prompt_versions enable row level security;
do $$ begin
  execute 'create policy "auth_all" on prompt_versions for all to authenticated using (true) with check (true)';
exception when duplicate_object then null; end $$;

-- ============ 4) Bucket público pros assets (logos, refs de briefing) ======
insert into storage.buckets (id, name, public)
values ('ops-assets', 'ops-assets', true)
on conflict (id) do update set public = true;
