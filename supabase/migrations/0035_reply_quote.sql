-- =============================================================
-- 0035 — Responder mensagem (citação estilo WhatsApp)
-- Guardamos um TRECHO desnormalizado da mensagem citada direto na
-- mensagem-resposta: render simples na bolha, sem join, e funciona
-- mesmo se a original for apagada. reply_to_dir diz quem escreveu a
-- citada ('in' = contato, 'out' = nós) pro rótulo "Você"/nome.
-- =============================================================

alter table public.whatsapp_messages
  add column if not exists reply_to_body text;

alter table public.whatsapp_messages
  add column if not exists reply_to_dir text;
