-- =============================================================
-- 0037 — Mapa @lid → lead (pro "digitando..." recebido)
-- O WhatsApp anonimiza contatos com @lid. As MENSAGENS trazem o par
-- (lid + telefone real em SenderAlt); os eventos de PRESENÇA trazem
-- SÓ o lid. Guardamos o lid no lead quando uma mensagem chega, e a
-- presença resolve por ele.
-- =============================================================

alter table public.leads add column if not exists wa_lid text;
create index if not exists idx_leads_wa_lid on public.leads (wa_lid);
