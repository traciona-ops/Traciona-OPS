import type { SupabaseClient } from "@supabase/supabase-js";

let settingsCache: { at: number; autoCard: boolean } = { at: 0, autoCard: false };

/** Config `org_settings.chat.auto_create_card` com cache de 60s. */
export async function autoCreateCardEnabled(
  admin: SupabaseClient
): Promise<boolean> {
  if (Date.now() - settingsCache.at < 60_000) return settingsCache.autoCard;
  const { data } = await admin
    .from("org_settings")
    .select("value")
    .eq("key", "chat")
    .maybeSingle();
  settingsCache = {
    at: Date.now(),
    autoCard: !!(data?.value as { auto_create_card?: boolean } | null)
      ?.auto_create_card,
  };
  return settingsCache.autoCard;
}
