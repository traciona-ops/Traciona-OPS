-- =============================================================
-- 0015 — Endurece handle_new_user (trigger de criação de perfil)
-- Faltava `set search_path` numa função SECURITY DEFINER → vetor de
-- search_path hijack (escalonamento de privilégio). Fixa o search_path.
-- =============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;
