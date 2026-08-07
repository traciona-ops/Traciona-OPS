-- =============================================================
-- 0025 — Busca automática de foto de perfil
--   avatar_checked_at = última vez que TENTAMOS puxar a foto do WhatsApp
--   (evita martelar a instância pra quem não tem foto/privacidade fechada)
-- =============================================================

alter table leads add column if not exists avatar_checked_at timestamptz;

create index if not exists idx_leads_avatar_pending
  on leads (avatar_checked_at)
  where phone is not null and avatar_url is null;
