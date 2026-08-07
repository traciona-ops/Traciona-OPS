import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "whatsapp-media";

/** Extrai o path de armazenamento de uma media_url (URL pública antiga ou path). */
function toPath(u: string): string {
  const k = `/${BUCKET}/`;
  const i = u.indexOf(k);
  return i >= 0 ? u.slice(i + k.length) : u.replace(/^\/+/, "");
}

/** Gera signed URL pra um único arquivo (ex.: pro conversor de áudio externo). */
export async function signMediaUrl(
  urlOrPath: string,
  expiresIn = 300
): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(toPath(urlOrPath), expiresIn);
  return data?.signedUrl ?? null;
}

/**
 * Substitui `media_url` por uma signed URL em cada mensagem que tem mídia.
 * Bucket é privado — sem isso a mídia não carrega na tela.
 */
export async function signMessageMedia<T extends { media_url: string | null }>(
  msgs: T[],
  expiresIn = 3600
): Promise<T[]> {
  const paths = Array.from(
    new Set(msgs.filter((m) => m.media_url).map((m) => toPath(m.media_url as string)))
  );
  if (paths.length === 0) return msgs;
  const admin = createAdminClient();
  const { data } = await admin.storage
    .from(BUCKET)
    .createSignedUrls(paths, expiresIn);
  const map = new Map<string, string>();
  (data ?? []).forEach((d) => {
    if (d.signedUrl && d.path) map.set(d.path, d.signedUrl);
  });
  return msgs.map((m) =>
    m.media_url
      ? { ...m, media_url: map.get(toPath(m.media_url)) ?? m.media_url }
      : m
  );
}
