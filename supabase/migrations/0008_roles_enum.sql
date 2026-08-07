-- =============================================================
-- 0008 — Papéis: adiciona 'gestor' e 'vendedor' ao enum user_role
-- (precisa ser commitado antes de usar os valores — ver 0009)
-- =============================================================

alter type user_role add value if not exists 'gestor';
alter type user_role add value if not exists 'vendedor';
