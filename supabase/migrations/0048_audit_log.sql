-- Audit logging for critical tables (leads, contracts, sales, commercial_tasks, etc.)
-- Captures auth.uid(), operation type, and old/new row state as JSONB.
-- SECURITY DEFINER so triggers fire even in RLS context.

-- ---------- audit_logs table ----------
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  user_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_table_idx on audit_logs(table_name);
create index if not exists audit_logs_record_idx on audit_logs(record_id);
create index if not exists audit_logs_user_idx on audit_logs(user_id);
create index if not exists audit_logs_created_at_idx on audit_logs(created_at);

comment on table audit_logs is
  'Audit trail for mutations on leads, contracts, sales, tasks, and other critical tables.';
comment on column audit_logs.table_name is
  'Name of the table that was changed (e.g., "leads", "contracts", "sales").';
comment on column audit_logs.operation is
  'Type of change: INSERT, UPDATE, or DELETE.';
comment on column audit_logs.record_id is
  'Primary key (id) of the record that was changed. Helps correlate edits to a single record.';
comment on column audit_logs.old_data is
  'Previous state of the record (null for INSERT). Full row as JSONB.';
comment on column audit_logs.new_data is
  'New state of the record (null for DELETE). Full row as JSONB.';
comment on column audit_logs.user_id is
  'ID of the user who made the change (auth.uid()). Null for cron/admin actions.';

-- ---------- Generic audit trigger function (SECURITY DEFINER) ----------
create or replace function audit_trigger()
returns trigger as $$
declare
  v_old_data jsonb;
  v_new_data jsonb;
  v_record_id uuid;
begin
  -- Capture old and new row states as JSONB
  v_old_data := to_jsonb(old);
  v_new_data := to_jsonb(new);

  -- Extract the id field (assume all audited tables have an id uuid PK)
  if tg_op = 'DELETE' then
    v_record_id := (v_old_data ->> 'id')::uuid;
  else
    v_record_id := (v_new_data ->> 'id')::uuid;
  end if;

  -- Insert audit log entry
  insert into public.audit_logs (table_name, operation, record_id, old_data, new_data, user_id)
  values (
    tg_table_name,
    tg_op,
    v_record_id,
    case when tg_op = 'DELETE' then v_old_data else null end,
    case when tg_op = 'INSERT' then v_new_data else v_new_data end,
    auth.uid()
  );

  -- Return appropriate row
  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$ language plpgsql security definer;

comment on function audit_trigger() is
  'Generic audit trigger: logs all INSERT, UPDATE, DELETE to audit_logs with full row state and auth.uid().';

-- ---------- Attach triggers to critical tables ----------

-- leads
drop trigger if exists audit_leads on leads;
create trigger audit_leads
  after insert or update or delete on leads
  for each row execute function audit_trigger();

-- contracts
drop trigger if exists audit_contracts on contracts;
create trigger audit_contracts
  after insert or update or delete on contracts
  for each row execute function audit_trigger();

-- sales
drop trigger if exists audit_sales on sales;
create trigger audit_sales
  after insert or update or delete on sales
  for each row execute function audit_trigger();

-- sale_payments
drop trigger if exists audit_sale_payments on sale_payments;
create trigger audit_sale_payments
  after insert or update or delete on sale_payments
  for each row execute function audit_trigger();

-- commercial_tasks (if it exists, else skip)
do $$ begin
  drop trigger if exists audit_commercial_tasks on commercial_tasks;
  create trigger audit_commercial_tasks
    after insert or update or delete on commercial_tasks
    for each row execute function audit_trigger();
exception when undefined_object or undefined_table then null; end $$;

-- pipeline_stages (captures stage creations, reordering, color changes)
do $$ begin
  drop trigger if exists audit_pipeline_stages on pipeline_stages;
  create trigger audit_pipeline_stages
    after insert or update or delete on pipeline_stages
    for each row execute function audit_trigger();
exception when undefined_object or undefined_table then null; end $$;

-- automations (captures automation rule changes)
do $$ begin
  drop trigger if exists audit_automations on automations;
  create trigger audit_automations
    after insert or update or delete on automations
    for each row execute function audit_trigger();
exception when undefined_object or undefined_table then null; end $$;
