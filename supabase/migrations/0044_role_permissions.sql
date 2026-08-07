-- Permissões de acesso por perfil (Configurações → Permissões de acesso).
-- Ausência de linha = liberado; só guardamos as NEGAÇÕES (allowed=false).
-- Admin ignora a tabela (sempre vê tudo). Escrita só via service role.

create table if not exists public.role_permissions (
  role text not null,
  module text not null,
  allowed boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (role, module)
);

alter table public.role_permissions enable row level security;

-- Todo usuário logado pode LER (o app precisa saber o que esconder);
-- nenhuma policy de escrita: só o service role altera.
drop policy if exists "role_permissions_read" on public.role_permissions;
create policy "role_permissions_read"
  on public.role_permissions for select
  to authenticated
  using (true);
