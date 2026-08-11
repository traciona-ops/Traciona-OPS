import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getStatus,
  getWebhookConfig,
  setWebhook,
  setGlobalPresence,
} from "@/lib/services/whatsapp/dinastia";

export type GuardianResult = {
  waOnline: boolean | null;
  webhookFixed: boolean;
};

/**
 * Por número ativo: status da sessão, presença (available só com OPS Chat
 * nos últimos 5 min) e re-aponta webhook/assinatura se saírem do lugar.
 *
 * TRAVA: só re-aponta webhook quando host é público — localhost apontaria
 * produção pra um endereço que a DinastiAPI não alcança.
 */
export async function runGuardian(
  admin: SupabaseClient,
  opts: { host: string }
): Promise<GuardianResult> {
  const { host } = opts;
  const expectedPrefix = `https://${host}/api/whatsapp/webhook`;
  const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET;

  const hostIsPublic =
    !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host) &&
    host.includes(".");

  const { data: act } = await admin
    .from("system_state")
    .select("value")
    .eq("key", "chat_activity")
    .maybeSingle();
  const lastAt = (act?.value as { at?: string } | null)?.at;
  const fresh =
    !!lastAt && Date.now() - new Date(lastAt).getTime() < 5 * 60_000;

  const { data: nums } = await admin
    .from("wa_numbers")
    .select("id, token, env_default")
    .eq("active", true);
  const numbers = (nums ?? []) as {
    id: string;
    token: string | null;
    env_default: boolean;
  }[];
  if (!numbers.some((n) => n.env_default))
    numbers.unshift({ id: "", token: null, env_default: true });

  let waOnline: boolean | null = null;
  let webhookFixed = false;

  for (const n of numbers) {
    const authToken = n.env_default ? undefined : n.token ?? undefined;
    if (!n.env_default && !authToken) continue;

    const s = await getStatus(authToken);
    const d = (s.data ?? {}) as { connected?: boolean; loggedIn?: boolean };
    const online = !!(s.ok && d.connected && d.loggedIn);
    if (n.env_default) waOnline = online;
    if (!online) continue;

    await setGlobalPresence(fresh ? "available" : "unavailable", authToken);

    const expectedUrl = n.env_default
      ? `${expectedPrefix}?secret=${webhookSecret}`
      : `${expectedPrefix}?secret=${webhookSecret}&n=${n.id}`;
    const wh = await getWebhookConfig(authToken);
    const subscribed =
      !!wh &&
      (wh.events.includes("All") || wh.events.includes("ChatPresence"));
    const rightUrl =
      !!wh &&
      wh.url.startsWith(expectedPrefix) &&
      (n.env_default || wh.url.includes(`n=${n.id}`));
    if (wh && (!rightUrl || !subscribed) && hostIsPublic) {
      await setWebhook(expectedUrl, authToken);
      webhookFixed = true;
      console.log(
        "[cron] webhook/assinatura re-apontados (estava em:",
        wh.url.split("?")[0] || "(vazio)",
        "| eventos:",
        wh.events.join(",") || "(nenhum)",
        ")"
      );
    }
  }

  const { data: prev } = await admin
    .from("system_state")
    .select("value")
    .eq("key", "whatsapp")
    .maybeSingle();
  const prevOnline = (prev?.value as { online?: boolean } | null)?.online;
  const prevSince = (prev?.value as { since?: string } | null)?.since;

  await admin.from("system_state").upsert({
    key: "whatsapp",
    value: {
      online: waOnline,
      since:
        prevOnline === waOnline && prevSince
          ? prevSince
          : new Date().toISOString(),
      checked_at: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  });

  return { waOnline, webhookFixed };
}
