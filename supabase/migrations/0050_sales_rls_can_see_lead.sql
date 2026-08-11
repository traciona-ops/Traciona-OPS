-- 0050 — Apertar RLS de sales / sale_payments por can_see_lead
-- Antes: using (true) pra qualquer autenticado.
-- Agora: admin OU lead visível via can_see_lead (mesmo padrão de whatsapp_messages).

drop policy if exists "auth_read" on public.sales;
drop policy if exists "auth_write" on public.sales;
drop policy if exists "auth_update" on public.sales;

create policy sales_select on public.sales
  for select to authenticated
  using (public.my_role() = 'admin' or public.can_see_lead(lead_id));

create policy sales_insert on public.sales
  for insert to authenticated
  with check (public.my_role() = 'admin' or public.can_see_lead(lead_id));

create policy sales_update on public.sales
  for update to authenticated
  using (public.my_role() = 'admin' or public.can_see_lead(lead_id))
  with check (public.my_role() = 'admin' or public.can_see_lead(lead_id));

create policy sales_delete on public.sales
  for delete to authenticated
  using (public.my_role() = 'admin' or public.can_see_lead(lead_id));

drop policy if exists "auth_read" on public.sale_payments;
drop policy if exists "auth_write" on public.sale_payments;
drop policy if exists "auth_update" on public.sale_payments;

create policy sale_payments_select on public.sale_payments
  for select to authenticated
  using (
    public.my_role() = 'admin'
    or exists (
      select 1 from public.sales s
      where s.id = sale_payments.sale_id
        and public.can_see_lead(s.lead_id)
    )
  );

create policy sale_payments_insert on public.sale_payments
  for insert to authenticated
  with check (
    public.my_role() = 'admin'
    or exists (
      select 1 from public.sales s
      where s.id = sale_payments.sale_id
        and public.can_see_lead(s.lead_id)
    )
  );

create policy sale_payments_update on public.sale_payments
  for update to authenticated
  using (
    public.my_role() = 'admin'
    or exists (
      select 1 from public.sales s
      where s.id = sale_payments.sale_id
        and public.can_see_lead(s.lead_id)
    )
  )
  with check (
    public.my_role() = 'admin'
    or exists (
      select 1 from public.sales s
      where s.id = sale_payments.sale_id
        and public.can_see_lead(s.lead_id)
    )
  );

create policy sale_payments_delete on public.sale_payments
  for delete to authenticated
  using (
    public.my_role() = 'admin'
    or exists (
      select 1 from public.sales s
      where s.id = sale_payments.sale_id
        and public.can_see_lead(s.lead_id)
    )
  );
