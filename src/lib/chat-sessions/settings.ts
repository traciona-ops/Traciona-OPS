import type { SupabaseClient } from "@supabase/supabase-js";

type ChatCfg = {
  sessions_enabled?: boolean;
  vip_stage_names?: string[];
};

let cache: { at: number; cfg: ChatCfg } = { at: 0, cfg: {} };

async function loadChatCfg(admin: SupabaseClient): Promise<ChatCfg> {
  if (Date.now() - cache.at < 60_000) return cache.cfg;
  const { data } = await admin
    .from("org_settings")
    .select("value")
    .eq("key", "chat")
    .maybeSingle();
  const cfg = (data?.value ?? {}) as ChatCfg;
  cache = { at: Date.now(), cfg };
  return cfg;
}

/** Flag org_settings.chat.sessions_enabled (cache 60s). */
export async function sessionsEnabled(admin: SupabaseClient): Promise<boolean> {
  const cfg = await loadChatCfg(admin);
  return !!cfg.sessions_enabled;
}

export async function vipStageNames(admin: SupabaseClient): Promise<string[]> {
  const cfg = await loadChatCfg(admin);
  const names = cfg.vip_stage_names;
  if (Array.isArray(names) && names.length > 0) {
    return names.map(String);
  }
  return ["Proposta"];
}

/** Invalida cache (após updateChatSettings). */
export function bustSessionsSettingsCache() {
  cache = { at: 0, cfg: {} };
}
