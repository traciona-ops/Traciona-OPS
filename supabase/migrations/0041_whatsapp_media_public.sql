-- O bucket de mídia do chat estava PRIVADO, mas todo o sistema (e a config
-- S3 da DinastiAPI) monta URLs públicas /object/public/whatsapp-media/... —
-- resultado: abrir/baixar mídia dava 400 "Bucket not found". As URLs têm
-- caminho não-adivinhável (uuid do lead + timestamp), mesmo modelo do design
-- original.
update storage.buckets set public = true where id = 'whatsapp-media';
