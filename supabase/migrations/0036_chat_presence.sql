-- =============================================================
-- 0036 — "Digitando..." recebido (ChatPresence do WhatsApp)
-- Uma linha por lead com o último estado; o webhook faz upsert e a
-- UI escuta via realtime. Estado é efêmero: a UI ignora registros
-- com mais de ~10s (composing repete enquanto a pessoa digita).
-- =============================================================

create table if not exists public.chat_presence (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  state text not null,
  at timestamptz not null default now()
);

alter table public.chat_presence enable row level security;
drop policy if exists chat_presence_select on public.chat_presence;
create policy chat_presence_select on public.chat_presence
  for select to authenticated using (true);

-- realtime (a publicação não é FOR ALL TABLES neste projeto)
do $$
begin
  alter publication supabase_realtime add table public.chat_presence;
exception when duplicate_object then null;
end $$;
