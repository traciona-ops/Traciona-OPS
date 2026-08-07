-- =============================================================
-- 0006 — Respostas rápidas (templates de mensagem)
-- =============================================================

create table if not exists quick_replies (
  id uuid primary key default gen_random_uuid(),
  shortcut text,
  title text not null,
  content text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table quick_replies enable row level security;

do $$
begin
  execute 'drop policy if exists "auth_read" on quick_replies';
  execute 'create policy "auth_read" on quick_replies for select to authenticated using (true)';
  execute 'drop policy if exists "auth_write" on quick_replies';
  execute 'create policy "auth_write" on quick_replies for insert to authenticated with check (true)';
  execute 'drop policy if exists "auth_update" on quick_replies';
  execute 'create policy "auth_update" on quick_replies for update to authenticated using (true) with check (true)';
  execute 'drop policy if exists "auth_delete" on quick_replies';
  execute 'create policy "auth_delete" on quick_replies for delete to authenticated using (true)';
end $$;

insert into quick_replies (shortcut, title, content, position)
select * from (values
  ('ola', 'Saudação', 'Olá {nome}, tudo bem? Aqui é da Traciona 👋', 0),
  ('orcamento', 'Enviar orçamento', 'Oi {nome}! Já preparei seu orçamento. Posso te enviar agora?', 1),
  ('followup', 'Follow-up', 'Oi {nome}, passando pra saber se você teve a chance de ver nossa proposta. Alguma dúvida?', 2),
  ('agendamento', 'Agendar reunião', 'Perfeito, {nome}! Qual o melhor dia e horário pra gente conversar?', 3)
) as v(shortcut, title, content, position)
where not exists (select 1 from quick_replies);
