import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getStatus,
  connectSession,
  getQR,
  disconnectSession,
  logoutSession,
  requestFullHistorySync,
  getAvatar,
  adminCreateInstance,
} from "@/lib/services/whatsapp/dinastia";
import { tokenForNumberId } from "@/lib/services/whatsapp/numbers";

type AdminClient = SupabaseClient;

export async function getWhatsappStateDomain(numberId?: string) {
  const s = await getStatus(await tokenForNumberId(numberId));
  const d = (s.data ?? {}) as Record<string, unknown>;
  const connected = !!(d.connected ?? d.Connected);
  const loggedIn = !!(d.loggedIn ?? d.LoggedIn ?? d.logged_in);
  const raw = String(d.qrcode ?? d.QRCode ?? "");
  const qr = raw
    ? raw.startsWith("data:")
      ? raw
      : `data:image/png;base64,${raw}`
    : null;
  const jid = String(d.jid ?? d.Jid ?? d.JID ?? "").trim() || null;
  return { ok: true as const, connected, loggedIn, qr, jid };
}

export async function connectWhatsappDomain(numberId?: string) {
  return await connectSession(await tokenForNumberId(numberId));
}

export async function fetchWhatsappQRDomain() {
  return await getQR();
}

export async function disconnectWhatsappDomain(numberId?: string) {
  return await disconnectSession(await tokenForNumberId(numberId));
}

export async function logoutWhatsappDomain(numberId?: string) {
  return await logoutSession(await tokenForNumberId(numberId));
}

export async function listWaNumbersDomain(admin: AdminClient) {
  const { data, error } = await admin
    .from("wa_numbers")
    .select("id, name, jid, env_default, active, created_at")
    .eq("active", true)
    .order("env_default", { ascending: false })
    .order("created_at");
  if (error) return { error: error.message };
  return {
    ok: true as const,
    numbers: (data ?? []) as {
      id: string;
      name: string;
      jid: string | null;
      env_default: boolean;
      active: boolean;
      created_at: string;
    }[],
  };
}

export async function addWaNumberDomain(
  admin: AdminClient,
  name: string,
  opts: { host: string; proto: string; secret: string }
): Promise<{ ok: true; id: string } | { error: string }> {
  if (!opts.host || !opts.secret)
    return { error: "Webhook não configurável (host/secret)." };

  const id = crypto.randomUUID();
  const webhookUrl = `${opts.proto}://${opts.host}/api/whatsapp/webhook?secret=${opts.secret}&n=${id}`;

  const r = await adminCreateInstance(name, webhookUrl);
  if (!r.ok) return { error: r.error };

  const { error } = await admin.from("wa_numbers").insert({
    id,
    name,
    token: r.token,
    instance_id: r.id || null,
  });
  if (error) return { error: error.message };
  return { ok: true as const, id };
}

export async function renameWaNumberDomain(
  admin: AdminClient,
  id: string,
  name: string
): Promise<{ ok: true } | { error: string }> {
  const { error } = await admin
    .from("wa_numbers")
    .update({ name })
    .eq("id", id);
  if (error) return { error: error.message };
  return { ok: true as const };
}

export async function removeWaNumberDomain(
  admin: AdminClient,
  id: string
): Promise<{ ok: true } | { error: string }> {
  const { error } = await admin
    .from("wa_numbers")
    .update({ active: false })
    .eq("id", id)
    .eq("env_default", false);
  if (error) return { error: error.message };
  return { ok: true as const };
}

export async function syncAvatarsDomain(admin: AdminClient) {
  const BATCH = 40;
  const { data: leads } = await admin
    .from("leads")
    .select("id, phone, avatar_id")
    .not("phone", "is", null)
    .is("avatar_url", null)
    .limit(BATCH);

  const list = leads ?? [];
  let updated = 0;
  for (const lead of list) {
    const av = await getAvatar(lead.phone as string);
    if (!av) continue;
    if (lead.avatar_id && av.id && lead.avatar_id === av.id) continue;
    try {
      const comma = av.base64.indexOf(",");
      const buf = Buffer.from(av.base64.slice(comma + 1), "base64");
      const path = `${lead.id}.jpg`;
      const { error: upErr } = await admin.storage
        .from("avatars")
        .upload(path, buf, { contentType: "image/jpeg", upsert: true });
      if (upErr) continue;
      const publicUrl = admin.storage.from("avatars").getPublicUrl(path).data
        .publicUrl;
      const finalUrl = `${publicUrl}?v=${av.id ?? Date.now()}`;
      await admin
        .from("leads")
        .update({
          avatar_url: finalUrl,
          avatar_id: av.id,
          avatar_checked_at: new Date().toISOString(),
        })
        .eq("id", lead.id);
      updated++;
    } catch {
      /* pula esse lead */
    }
  }

  const { count: remaining } = await admin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .not("phone", "is", null)
    .is("avatar_url", null);

  return { ok: true as const, updated, remaining: remaining ?? 0 };
}

export async function requestChatHistoryDomain() {
  const r = await requestFullHistorySync({
    days: 30,
    sizeMb: 500,
    includeGroups: false,
    includeCalls: false,
  });
  if (!r.ok) return { error: r.error };
  return { ok: true as const, requestId: r.requestId };
}
