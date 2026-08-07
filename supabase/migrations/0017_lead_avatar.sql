-- =============================================================
-- 0017 — Foto de perfil do WhatsApp nos leads
--   avatar_url: URL pública da foto (bucket avatars, servida direto)
--   avatar_id:  id da foto no WhatsApp (muda quando o contato troca a foto)
-- Bucket "avatars" é PÚBLICO de propósito: foto de perfil é baixa
-- sensibilidade (qualquer um vê no WhatsApp) e aparece em toda lista/card,
-- então signed URL a cada render seria caro.
-- =============================================================

alter table leads add column if not exists avatar_url text;
alter table leads add column if not exists avatar_id text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;
