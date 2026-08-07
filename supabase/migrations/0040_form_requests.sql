-- OPS Form: formulário público (estilo Respondi) pro CLIENTE preencher os
-- dados do contrato. A equipe define os termos comerciais; o cliente responde
-- pelo link com token; o contrato nasce sozinho como rascunho.

create table if not exists form_requests (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  lead_id uuid not null references leads(id) on delete cascade,
  kind text not null default 'contrato_trafego_pago',
  status text not null default 'pendente'
    check (status in ('pendente','respondido','cancelado')),
  terms jsonb,
  answers jsonb,
  contract_id uuid references contracts(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create index if not exists form_requests_lead_idx on form_requests(lead_id);
create index if not exists form_requests_status_idx on form_requests(status);

alter table form_requests enable row level security;

-- equipe logada gerencia; o fluxo público (página /f) usa service role
do $$ begin
  execute 'create policy "auth_read" on form_requests for select to authenticated using (true)';
  execute 'create policy "auth_write" on form_requests for insert to authenticated with check (true)';
  execute 'create policy "auth_update" on form_requests for update to authenticated using (true) with check (true)';
exception when duplicate_object then null; end $$;
