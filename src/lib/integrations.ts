import { createAdminClient } from "@/lib/supabase/admin";

// Credenciais de integração: banco primeiro (editável nas Configurações),
// .env como reserva. Cache curto por instância pra não bater no banco em
// toda chamada.

type SecretValue = Record<string, string>;

const cache = new Map<string, { value: SecretValue; at: number }>();
const TTL = 60_000;

export async function getIntegrationSecret(
  key: string
): Promise<SecretValue> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("integration_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    const value = ((data as { value: SecretValue } | null)?.value ??
      {}) as SecretValue;
    cache.set(key, { value, at: Date.now() });
    return value;
  } catch {
    return hit?.value ?? {};
  }
}

export async function setIntegrationSecret(
  key: string,
  value: SecretValue
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("integration_settings").upsert({
    key,
    value,
    updated_at: new Date().toISOString(),
  });
  cache.set(key, { value, at: Date.now() });
}

/** Limpa o cache (após salvar, pra teste imediato usar o valor novo). */
export function bustIntegrationCache(key?: string) {
  if (key) cache.delete(key);
  else cache.clear();
}
