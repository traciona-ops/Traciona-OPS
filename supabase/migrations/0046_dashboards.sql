-- Dashboards montados pelo usuário.
--
-- Um dashboard guarda três coisas: os filtros globais que valem pra tela
-- inteira, a lista de blocos (nativos ou métricas criadas na mão) e a ordem
-- deles. Tudo em jsonb porque a forma de uma métrica é do produto, não do
-- banco — e porque nenhuma consulta filtra por dentro desse conteúdo.
--
-- A métrica NUNCA guarda SQL. Ela guarda uma especificação fechada
-- (fonte + medida + recorte), que o servidor traduz em consulta usando o
-- cliente com a sessão do usuário. Assim a RLS continua sendo a autoridade:
-- um vendedor que monta uma métrica de "negócios ganhos" só soma os dele.

create table if not exists public.dashboards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'Meu dashboard',
  position int not null default 0,
  filters jsonb not null default '{}'::jsonb,
  widgets jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dashboards_owner_idx
  on public.dashboards (owner_id, position);

drop trigger if exists dashboards_touch on public.dashboards;
create trigger dashboards_touch
  before update on public.dashboards
  for each row execute function public.set_updated_at();

alter table public.dashboards enable row level security;

-- Dashboard é pessoal: só o dono lê e escreve o dele. Um gestor que queira
-- acompanhar o time faz isso pelos filtros de dono dentro do próprio
-- dashboard, não lendo o dashboard alheio.
drop policy if exists dashboards_own on public.dashboards;
create policy dashboards_own on public.dashboards
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

comment on table public.dashboards is
  'Dashboards montados pelo usuário. widgets = blocos nativos e métricas customizadas; filters = recorte global da tela.';
comment on column public.dashboards.widgets is
  'jsonb: [{ id, kind: "builtin"|"metric", key?, spec?, span }]. spec é especificação fechada, nunca SQL.';
comment on column public.dashboards.filters is
  'jsonb: { from, to, ownerIds[], pipelineId, stageIds[], sources[], taskCategories[] }.';
