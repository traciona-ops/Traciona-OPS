-- =============================================================
-- 0012 — Bucket de mídia privado
-- A mídia (áudios/imagens de conversas) deixa de ser pública.
-- Exibição passa a usar signed URLs geradas pelo service role no servidor.
-- Upload e download continuam via service role (admin client) → não precisam
-- de policy em storage.objects.
-- =============================================================

update storage.buckets set public = false where id = 'whatsapp-media';
