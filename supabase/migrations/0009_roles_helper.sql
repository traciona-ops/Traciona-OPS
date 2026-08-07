-- =============================================================
-- 0009 — Migra papéis antigos e cria helper my_role()
-- =============================================================

-- Mapeia papéis antigos para o novo conjunto (admin / gestor / vendedor)
update profiles set role = 'vendedor' where role in ('sales', 'ops');

-- Papel do usuário logado. SECURITY DEFINER + STABLE para uso eficiente em RLS
-- (não recursiona porque profiles tem SELECT liberado para authenticated).
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text from public.profiles where id = auth.uid()
$$;

grant execute on function public.my_role() to authenticated;
