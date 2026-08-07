-- Vendas (Setor Comercial, Fase 3) + integração Asaas.
-- sales = a venda (recorrente ou avulsa); sale_payments = as cobranças
-- (parcelas/mensalidades) espelhadas do Asaas via webhook.

create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  contract_id uuid references contracts(id) on delete set null,
  description text not null,
  kind text not null default 'recorrente'
    check (kind in ('recorrente','avulsa')),
  value numeric(14,2) not null,
  billing_day int,
  status text not null default 'ativa'
    check (status in ('ativa','encerrada','cancelada')),
  asaas_customer_id text,
  asaas_subscription_id text,
  asaas_payment_id text,
  started_at date,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  asaas_payment_id text unique,
  value numeric(14,2),
  due_date date,
  status text not null default 'pendente'
    check (status in ('pendente','pago','atrasado','estornado','cancelado')),
  billing_type text,
  invoice_url text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sales_lead_idx on sales(lead_id);
create index if not exists sales_contract_idx on sales(contract_id);
create index if not exists sales_status_idx on sales(status);
create index if not exists sale_payments_sale_idx on sale_payments(sale_id);
create index if not exists sale_payments_status_idx on sale_payments(status);

alter table sales enable row level security;
alter table sale_payments enable row level security;

do $$ begin
  execute 'create policy "auth_read" on sales for select to authenticated using (true)';
  execute 'create policy "auth_write" on sales for insert to authenticated with check (true)';
  execute 'create policy "auth_update" on sales for update to authenticated using (true) with check (true)';
  execute 'create policy "auth_read" on sale_payments for select to authenticated using (true)';
  execute 'create policy "auth_write" on sale_payments for insert to authenticated with check (true)';
  execute 'create policy "auth_update" on sale_payments for update to authenticated using (true) with check (true)';
exception when duplicate_object then null; end $$;
