-- =============================================================
-- 0033 — Multi-número (instâncias DinastiAPI ilimitadas)
-- wa_numbers guarda cada instância conectável. O token é SEGREDO:
-- RLS ligada SEM policy de select — só o service role (server actions
-- com requireAdmin) enxerga. A instância principal continua no env e
-- é representada aqui por uma linha com env_default = true (sem token).
-- Mensagem ganha number_id: a resposta sai pelo número em que chegou.
-- =============================================================

create table if not exists public.wa_numbers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- token da instância no wuzapi; null = usa o WHATSAPP_API_TOKEN do env
  token text,
  instance_id text,
  jid text,
  env_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.wa_numbers enable row level security;
-- sem policies de propósito: tokens nunca chegam ao browser

-- de qual número a mensagem entrou/saiu (null = principal, pré multi-número)
alter table public.whatsapp_messages
  add column if not exists number_id uuid references public.wa_numbers(id) on delete set null;

create index if not exists idx_wa_msgs_number
  on public.whatsapp_messages (lead_id, number_id, created_at desc);

-- linha do número principal (token null → env)
insert into public.wa_numbers (name, env_default, active)
select 'Principal', true, true
where not exists (select 1 from public.wa_numbers where env_default);
