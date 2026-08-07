-- Contratos (Setor Comercial) + integração Autentique.
-- O PDF original fica no bucket PRIVADO 'contracts' (acesso só por URL
-- assinada gerada no servidor); o assinado vem da própria Autentique.

create table if not exists contracts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  title text not null,
  value numeric(14,2),
  starts_at date,
  ends_at date,
  status text not null default 'rascunho'
    check (status in ('rascunho','enviado','assinado','recusado','encerrado')),
  file_path text,
  signed_file_url text,
  autentique_id text,
  sign_link text,
  signer_email text,
  sent_at timestamptz,
  signed_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contracts_lead_idx on contracts(lead_id);
create index if not exists contracts_status_idx on contracts(status);

alter table contracts enable row level security;

do $$ begin
  execute 'create policy "auth_read" on contracts for select to authenticated using (true)';
  execute 'create policy "auth_write" on contracts for insert to authenticated with check (true)';
  execute 'create policy "auth_update" on contracts for update to authenticated using (true) with check (true)';
  execute 'create policy "auth_delete" on contracts for delete to authenticated using (true)';
exception when duplicate_object then null; end $$;

-- bucket privado pros PDFs (uploads passam pelo servidor com service role)
insert into storage.buckets (id, name, public)
values ('contracts', 'contracts', false)
on conflict (id) do nothing;
