-- =============================================================
-- 0011 — Setores (Vendas / Suporte / Financeiro) + visibilidade
--   admin: vê tudo (todos os setores)
--   gestor: vê tudo do SEU setor
--   vendedor: vê os leads DELE (owner) dentro do seu setor
-- Setor é texto fixo no app ('vendas' | 'suporte' | 'financeiro').
-- =============================================================

alter table leads add column if not exists sector text not null default 'vendas';
alter table profiles add column if not exists sector text not null default 'vendas';
create index if not exists idx_leads_sector on leads(sector);

-- setor do usuário logado
create or replace function public.my_sector()
returns text language sql stable security definer set search_path = public
as $$ select sector from public.profiles where id = auth.uid() $$;
grant execute on function public.my_sector() to authenticated;

-- posso ver este lead? (encapsula a regra pra reaproveitar nas tabelas ligadas)
create or replace function public.can_see_lead(lid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.leads l
    where l.id = lid and (
      public.my_role() = 'admin'
      or (l.sector = public.my_sector()
          and (public.my_role() = 'gestor' or l.owner_id = auth.uid()))
    )
  )
$$;
grant execute on function public.can_see_lead(uuid) to authenticated;

-- ---------- LEADS ----------
drop policy if exists leads_select on leads;
drop policy if exists leads_insert on leads;
drop policy if exists leads_update on leads;
drop policy if exists leads_delete on leads;

create policy leads_select on leads for select to authenticated using (
  public.my_role() = 'admin'
  or (sector = public.my_sector() and (public.my_role() = 'gestor' or owner_id = auth.uid()))
);
create policy leads_insert on leads for insert to authenticated with check (
  public.my_role() = 'admin'
  or (sector = public.my_sector() and (public.my_role() = 'gestor' or owner_id = auth.uid()))
);
create policy leads_update on leads for update to authenticated
using (
  public.my_role() = 'admin'
  or (sector = public.my_sector() and (public.my_role() = 'gestor' or owner_id = auth.uid()))
)
with check (
  public.my_role() = 'admin'
  or (sector = public.my_sector() and (public.my_role() = 'gestor' or owner_id = auth.uid()))
);
create policy leads_delete on leads for delete to authenticated using (
  public.my_role() = 'admin'
  or (public.my_role() = 'gestor' and sector = public.my_sector())
);

-- ---------- Tabelas ligadas ao lead (seguem can_see_lead) ----------
do $$
declare t text;
begin
  foreach t in array array['whatsapp_messages','lead_notes','lead_tags','meetings','scheduled_messages'] loop
    execute format('drop policy if exists %I on %I', 'wa_all', t);
    execute format('drop policy if exists %I on %I', 'notes_all', t);
    execute format('drop policy if exists %I on %I', 'tags_all', t);
    execute format('drop policy if exists %I on %I', 'meetings_all', t);
    execute format('drop policy if exists %I on %I', 'sched_all', t);
    execute format(
      'create policy lead_scoped on %I for all to authenticated using (public.my_role() = ''admin'' or public.can_see_lead(%I.lead_id)) with check (public.my_role() = ''admin'' or public.can_see_lead(%I.lead_id))',
      t, t, t
    );
  end loop;
end $$;

-- lead_transfers (gestor/admin escrevem; visibilidade por can_see_lead)
drop policy if exists transfers_select on lead_transfers;
drop policy if exists transfers_write on lead_transfers;
drop policy if exists transfers_update on lead_transfers;
drop policy if exists transfers_delete on lead_transfers;
create policy transfers_select on lead_transfers for select to authenticated
  using (public.my_role() = 'admin' or public.can_see_lead(lead_id));
create policy transfers_write on lead_transfers for insert to authenticated
  with check (public.my_role() in ('admin','gestor'));
create policy transfers_update on lead_transfers for update to authenticated
  using (public.my_role() in ('admin','gestor')) with check (public.my_role() in ('admin','gestor'));
create policy transfers_delete on lead_transfers for delete to authenticated
  using (public.my_role() in ('admin','gestor'));

-- lead_tasks (lead visível OU atribuída/criada por mim)
drop policy if exists tasks_all on lead_tasks;
create policy tasks_all on lead_tasks for all to authenticated
using (
  public.my_role() = 'admin'
  or assignee_id = auth.uid()
  or created_by = auth.uid()
  or public.can_see_lead(lead_id)
)
with check (
  public.my_role() = 'admin'
  or assignee_id = auth.uid()
  or created_by = auth.uid()
  or public.can_see_lead(lead_id)
);
