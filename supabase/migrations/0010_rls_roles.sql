-- =============================================================
-- 0010 — RLS por papel/dono
--   admin/gestor: acesso total
--   vendedor: só os leads onde é o responsável (owner_id) e dados ligados
--   config (pipelines/etapas/quick_replies): leitura todos, escrita admin/gestor
--   profiles: leitura todos; escrita só via service role (admin client)
-- =============================================================

-- helper de "admin ou gestor" pra encurtar as policies
create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.my_role() in ('admin','gestor') $$;

grant execute on function public.is_manager() to authenticated;

-- ---------- LEADS (por dono) ----------
drop policy if exists auth_read on leads;
drop policy if exists auth_write on leads;
drop policy if exists auth_update on leads;
drop policy if exists auth_delete on leads;

create policy leads_select on leads for select to authenticated
  using (public.is_manager() or owner_id = auth.uid());
create policy leads_insert on leads for insert to authenticated
  with check (public.is_manager() or owner_id = auth.uid());
create policy leads_update on leads for update to authenticated
  using (public.is_manager() or owner_id = auth.uid())
  with check (public.is_manager() or owner_id = auth.uid());
create policy leads_delete on leads for delete to authenticated
  using (public.is_manager());

-- ---------- Tabelas ligadas ao lead (seguem o dono do lead) ----------
-- whatsapp_messages
drop policy if exists auth_read on whatsapp_messages;
drop policy if exists auth_write on whatsapp_messages;
drop policy if exists auth_update on whatsapp_messages;
drop policy if exists auth_delete on whatsapp_messages;
create policy wa_all on whatsapp_messages for all to authenticated
  using (
    public.is_manager()
    or exists (select 1 from leads l where l.id = whatsapp_messages.lead_id and l.owner_id = auth.uid())
  )
  with check (
    public.is_manager()
    or exists (select 1 from leads l where l.id = whatsapp_messages.lead_id and l.owner_id = auth.uid())
  );

-- lead_notes
drop policy if exists auth_read on lead_notes;
drop policy if exists auth_write on lead_notes;
drop policy if exists auth_update on lead_notes;
drop policy if exists auth_delete on lead_notes;
create policy notes_all on lead_notes for all to authenticated
  using (
    public.is_manager()
    or exists (select 1 from leads l where l.id = lead_notes.lead_id and l.owner_id = auth.uid())
  )
  with check (
    public.is_manager()
    or exists (select 1 from leads l where l.id = lead_notes.lead_id and l.owner_id = auth.uid())
  );

-- lead_tags
drop policy if exists auth_read on lead_tags;
drop policy if exists auth_write on lead_tags;
drop policy if exists auth_update on lead_tags;
drop policy if exists auth_delete on lead_tags;
create policy tags_all on lead_tags for all to authenticated
  using (
    public.is_manager()
    or exists (select 1 from leads l where l.id = lead_tags.lead_id and l.owner_id = auth.uid())
  )
  with check (
    public.is_manager()
    or exists (select 1 from leads l where l.id = lead_tags.lead_id and l.owner_id = auth.uid())
  );

-- meetings (lead_id pode ser null -> só manager vê os órfãos)
drop policy if exists auth_read on meetings;
drop policy if exists auth_write on meetings;
drop policy if exists auth_update on meetings;
drop policy if exists auth_delete on meetings;
create policy meetings_all on meetings for all to authenticated
  using (
    public.is_manager()
    or exists (select 1 from leads l where l.id = meetings.lead_id and l.owner_id = auth.uid())
  )
  with check (
    public.is_manager()
    or exists (select 1 from leads l where l.id = meetings.lead_id and l.owner_id = auth.uid())
  );

-- scheduled_messages
drop policy if exists auth_read on scheduled_messages;
drop policy if exists auth_write on scheduled_messages;
drop policy if exists auth_update on scheduled_messages;
drop policy if exists auth_delete on scheduled_messages;
create policy sched_all on scheduled_messages for all to authenticated
  using (
    public.is_manager()
    or exists (select 1 from leads l where l.id = scheduled_messages.lead_id and l.owner_id = auth.uid())
  )
  with check (
    public.is_manager()
    or exists (select 1 from leads l where l.id = scheduled_messages.lead_id and l.owner_id = auth.uid())
  );

-- lead_transfers (só manager mexe; vendedor enxerga as do próprio lead)
drop policy if exists auth_read on lead_transfers;
drop policy if exists auth_write on lead_transfers;
drop policy if exists auth_update on lead_transfers;
drop policy if exists auth_delete on lead_transfers;
create policy transfers_select on lead_transfers for select to authenticated
  using (
    public.is_manager()
    or exists (select 1 from leads l where l.id = lead_transfers.lead_id and l.owner_id = auth.uid())
  );
create policy transfers_write on lead_transfers for insert to authenticated
  with check (public.is_manager());
create policy transfers_update on lead_transfers for update to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy transfers_delete on lead_transfers for delete to authenticated
  using (public.is_manager());

-- lead_tasks (lead do dono OU atribuída/criada por mim)
drop policy if exists auth_read on lead_tasks;
drop policy if exists auth_write on lead_tasks;
drop policy if exists auth_update on lead_tasks;
drop policy if exists auth_delete on lead_tasks;
create policy tasks_all on lead_tasks for all to authenticated
  using (
    public.is_manager()
    or assignee_id = auth.uid()
    or created_by = auth.uid()
    or exists (select 1 from leads l where l.id = lead_tasks.lead_id and l.owner_id = auth.uid())
  )
  with check (
    public.is_manager()
    or assignee_id = auth.uid()
    or created_by = auth.uid()
    or exists (select 1 from leads l where l.id = lead_tasks.lead_id and l.owner_id = auth.uid())
  );

-- ---------- Config: leitura todos, escrita admin/gestor ----------
do $$
declare t text;
begin
  foreach t in array array['pipelines','pipeline_stages','quick_replies'] loop
    execute format('drop policy if exists auth_read on %I', t);
    execute format('drop policy if exists auth_write on %I', t);
    execute format('drop policy if exists auth_update on %I', t);
    execute format('drop policy if exists auth_delete on %I', t);
    execute format('create policy cfg_read on %I for select to authenticated using (true)', t);
    execute format('create policy cfg_write on %I for insert to authenticated with check (public.is_manager())', t);
    execute format('create policy cfg_update on %I for update to authenticated using (public.is_manager()) with check (public.is_manager())', t);
    execute format('create policy cfg_delete on %I for delete to authenticated using (public.is_manager())', t);
  end loop;
end $$;

-- ---------- profiles: leitura todos; escrita só service role ----------
drop policy if exists auth_read on profiles;
drop policy if exists auth_write on profiles;
drop policy if exists auth_update on profiles;
drop policy if exists auth_delete on profiles;
create policy profiles_read on profiles for select to authenticated using (true);
-- sem policies de escrita: INSERT/UPDATE/DELETE só via service role (admin client)
