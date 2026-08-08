-- ABAC (Attribute-Based Access Control) for granular resource+action permissions.
-- Extends role_permissions (which gates module access) with resource-level + condition evaluation.
-- Example: {resource: 'lead', action: 'delete', conditions: {maxValue: 500, reqManager: true}}

-- ---------- role_permissions_abac table ----------
create table if not exists public.role_permissions_abac (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  resource text not null,
  action text not null,
  conditions jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role, resource, action)
);

create index if not exists role_permissions_abac_role_idx on public.role_permissions_abac(role);
create index if not exists role_permissions_abac_resource_idx on public.role_permissions_abac(resource);
create index if not exists role_permissions_abac_action_idx on public.role_permissions_abac(action);

alter table public.role_permissions_abac enable row level security;

comment on table public.role_permissions_abac is
  'ABAC rules: role + resource + action with optional JSON conditions (maxValue, reqManager, sector, etc.)';
comment on column public.role_permissions_abac.role is
  'User role: admin, gestor, vendedor';
comment on column public.role_permissions_abac.resource is
  'Resource type: lead, contract, task, etc.';
comment on column public.role_permissions_abac.action is
  'Action on resource: delete, transfer, edit, etc.';
comment on column public.role_permissions_abac.conditions is
  'Optional JSON object with condition attributes (e.g., {maxValue: 500, reqManager: true, sector: "vendas"})';
comment on column public.role_permissions_abac.enabled is
  'If false, this rule is soft-disabled without deleting';

-- ---------- RLS Policies ----------
-- Read: authenticated users can read to decide UI/UX
drop policy if exists "role_permissions_abac_read" on public.role_permissions_abac;
create policy "role_permissions_abac_read"
  on public.role_permissions_abac for select
  to authenticated
  using (true);

-- Write: only service role (no policy = bypassed)

-- ---------- check_permission(role, resource, action, context) function ----------
-- Evaluates ABAC rule: returns TRUE if permitted, FALSE otherwise.
-- context (jsonb) is optional and contains runtime values (e.g., {value: 250, userRole: 'gestor', sector: 'vendas'}).

create or replace function public.check_permission(
  p_role text,
  p_resource text,
  p_action text,
  p_context jsonb default null
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_rule record;
  v_max_value numeric;
  v_req_manager boolean;
  v_allowed_sector text;
  v_context_value numeric;
  v_context_sector text;
begin
  -- Admin always has permission
  if p_role = 'admin' then
    return true;
  end if;

  -- Fetch the ABAC rule
  select * into v_rule
  from public.role_permissions_abac
  where role = p_role
    and resource = p_resource
    and action = p_action
    and enabled = true
  limit 1;

  -- No rule found = deny by default
  if v_rule is null then
    return false;
  end if;

  -- If no conditions, rule permits
  if v_rule.conditions is null or v_rule.conditions = '{}'::jsonb then
    return true;
  end if;

  -- Evaluate conditions
  -- maxValue: context.value must be <= condition.maxValue
  v_max_value := (v_rule.conditions ->> 'maxValue')::numeric;
  if v_max_value is not null then
    v_context_value := (p_context ->> 'value')::numeric;
    if v_context_value is not null and v_context_value > v_max_value then
      return false;
    end if;
  end if;

  -- reqManager: if true, context.userRole must be gestor or admin
  v_req_manager := (v_rule.conditions ->> 'reqManager')::boolean;
  if v_req_manager = true then
    if p_context is null or (p_context ->> 'userRole') not in ('gestor', 'admin') then
      return false;
    end if;
  end if;

  -- sector: context.sector must match condition.sector
  v_allowed_sector := v_rule.conditions ->> 'sector';
  if v_allowed_sector is not null then
    v_context_sector := p_context ->> 'sector';
    if v_context_sector != v_allowed_sector then
      return false;
    end if;
  end if;

  -- All conditions passed
  return true;
end;
$$;

comment on function public.check_permission(text, text, text, jsonb) is
  'Evaluate ABAC rule: (role, resource, action) with optional context. Admin always permitted. No rule = deny.';
