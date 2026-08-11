import type { SupabaseClient } from "@supabase/supabase-js";
import { runReplyAutomations } from "@/lib/automations/engine";
import { ensureLeadAvatar, type AvatarLead } from "@/lib/services/whatsapp/avatar";
import { placeLeadInDefaultPipeline } from "@/lib/crm/pipeline-placement";
import { autoCreateCardEnabled } from "@/lib/whatsapp/chat-settings";
import { phoneFromMessageInfo } from "@/lib/whatsapp/jid";
import {
  enrichLeadFromInbound,
  findOrCreateWaLead,
} from "@/lib/whatsapp/leads";
import { storeInboundMedia } from "@/lib/whatsapp/media-store";
import { ensureActiveSession } from "@/lib/chat-sessions/ensure-active-session";

type AnyObj = Record<string, any>;

export type IngestLiveResult =
  | { ok: true; ignored: string }
  | { ok: true; duplicate: true }
  | { ok: true; stored: true; media: string | null }
  | { ok: false; error: string; status: 500 };

function unwrapMessageContent(msg: AnyObj): AnyObj {
  let mc: AnyObj = msg;
  if (mc.deviceSentMessage?.message) mc = mc.deviceSentMessage.message;
  if (mc.ephemeralMessage?.message) mc = mc.ephemeralMessage.message;
  if (mc.viewOnceMessageV2?.message) mc = mc.viewOnceMessageV2.message;
  return mc;
}

function extractBodyAndMedia(mc: AnyObj): {
  body: string | null;
  mediaKind: "image" | "audio" | "video" | "document" | null;
  node: AnyObj | null;
} {
  let body: string | null =
    mc.conversation ?? mc.extendedTextMessage?.text ?? null;
  let mediaKind: "image" | "audio" | "video" | "document" | null = null;
  let node: AnyObj | null = null;

  if (mc.imageMessage) {
    mediaKind = "image";
    node = mc.imageMessage;
    body = body ?? node?.caption ?? null;
  } else if (mc.audioMessage) {
    mediaKind = "audio";
    node = mc.audioMessage;
  } else if (mc.videoMessage) {
    mediaKind = "video";
    node = mc.videoMessage;
    body = body ?? node?.caption ?? null;
  } else if (mc.documentMessage) {
    mediaKind = "document";
    node = mc.documentMessage;
    body = body ?? node?.caption ?? null;
  } else if (mc.stickerMessage) {
    body = body ?? "🧩 Figurinha";
  } else if (mc.locationMessage) {
    const lat = mc.locationMessage.degreesLatitude;
    const lng = mc.locationMessage.degreesLongitude;
    const name = mc.locationMessage.name ? `${mc.locationMessage.name} — ` : "";
    body =
      body ??
      (lat != null && lng != null
        ? `📍 ${name}https://maps.google.com/?q=${lat},${lng}`
        : "📍 Localização");
  } else if (mc.contactMessage) {
    const dn = mc.contactMessage.displayName ?? "";
    const tel =
      String(mc.contactMessage.vcard ?? "").match(
        /TEL[^:]*:([+\d][\d\s()-]+)/
      )?.[1] ?? "";
    body = body ?? `👤 Contato: ${dn}${tel ? ` (${tel.trim()})` : ""}`;
  } else if (mc.contactsArrayMessage) {
    const names = (mc.contactsArrayMessage.contacts ?? [])
      .map((c: AnyObj) => c.displayName)
      .filter(Boolean)
      .join(", ");
    body = body ?? `👤 Contatos: ${names || "—"}`;
  }

  return { body, mediaKind, node };
}

/**
 * Ingestão de mensagem 1:1 (live). Preserva status HTTP: insert falho → 500.
 */
export async function ingestLiveMessage(
  admin: SupabaseClient,
  opts: {
    numberId: string | null;
    payload: AnyObj;
    info: AnyObj;
    msg: AnyObj;
  }
): Promise<IngestLiveResult> {
  const { numberId, payload, info, msg } = opts;

  const chatJid = String(info.Chat ?? "");
  if (
    info.IsGroup === true ||
    chatJid.includes("@g.us") ||
    chatJid.includes("broadcast")
  ) {
    return { ok: true, ignored: "group-or-broadcast" };
  }

  const fromMe = info.IsFromMe === true;
  const phone = phoneFromMessageInfo(info);
  if (!phone) return { ok: true, ignored: "no-real-phone" };

  const mc = unwrapMessageContent(msg);
  const { body, mediaKind, node } = extractBodyAndMedia(mc);
  if (!body && !mediaKind) return { ok: true, ignored: "no-content" };

  const msgId = info.ID ?? info.id ?? null;
  if (msgId) {
    const { data: dup } = await admin
      .from("whatsapp_messages")
      .select("id")
      .eq("provider_msg_id", msgId)
      .limit(1)
      .maybeSingle();
    if (dup) return { ok: true, duplicate: true };
  }

  const pushName = fromMe
    ? ""
    : String(
        info.PushName ?? (payload as { pushName?: string })?.pushName ?? ""
      ).trim();

  const resolved = await findOrCreateWaLead(admin, phone, pushName);
  if ("error" in resolved) {
    console.log("[WH] find_or_create lead falhou:", resolved.error);
    return { ok: true, ignored: "lead-resolve-failed" };
  }
  const { leadId } = resolved;

  await enrichLeadFromInbound(admin, leadId, { pushName, fromMe, info });

  let media_url: string | null = null;
  let media_type: string | null = null;
  if (mediaKind && node) {
    const stored = await storeInboundMedia(admin, {
      leadId,
      fromMe,
      mediaKind,
      node,
    });
    if (stored) {
      media_url = stored.media_url;
      media_type = stored.media_type;
    }
  }

  let reply_to_body: string | null = null;
  let reply_to_dir: string | null = null;
  const ctxInfo =
    mc.extendedTextMessage?.contextInfo ??
    mc.imageMessage?.contextInfo ??
    mc.videoMessage?.contextInfo ??
    mc.audioMessage?.contextInfo ??
    mc.documentMessage?.contextInfo ??
    null;
  const quotedId = ctxInfo?.stanzaID ?? ctxInfo?.stanzaId ?? null;
  if (quotedId) {
    const { data: quoted } = await admin
      .from("whatsapp_messages")
      .select("body, media_type, direction")
      .eq("lead_id", leadId)
      .eq("provider_msg_id", quotedId)
      .maybeSingle();
    const q = quoted as {
      body: string | null;
      media_type: string | null;
      direction: string;
    } | null;
    if (q) {
      reply_to_body =
        (q.body ?? (q.media_type ? "[mídia]" : "")).slice(0, 180) || null;
      reply_to_dir = q.direction;
    } else {
      const qm = ctxInfo?.quotedMessage;
      const qBody =
        qm?.conversation ?? qm?.extendedTextMessage?.text ?? null;
      if (qBody) {
        reply_to_body = String(qBody).slice(0, 180);
        reply_to_dir = fromMe ? "in" : "out";
      }
    }
  }

  let sessionId: string | null = null;
  try {
    const sess = await ensureActiveSession(admin, {
      leadId,
      numberId,
      direction: fromMe ? "out" : "in",
    });
    sessionId = sess.sessionId;
  } catch (e) {
    console.log("[WH] sessão falhou (msg segue):", (e as Error).message);
  }

  const { error: insErr } = await admin.from("whatsapp_messages").insert({
    lead_id: leadId,
    number_id: numberId,
    session_id: sessionId,
    reply_to_body,
    reply_to_dir,
    direction: fromMe ? "out" : "in",
    body,
    media_url,
    media_type,
    status: fromMe ? "sent" : "received",
    provider: "dinastia",
    provider_msg_id: msgId,
  });
  if (insErr && insErr.code !== "23505") {
    console.log("[WH][ERR] insert mensagem falhou:", insErr.message);
    return { ok: false, error: "insert-failed", status: 500 };
  }

  await admin
    .from("leads")
    .update({ last_contact_at: new Date().toISOString() })
    .eq("id", leadId);

  try {
    if (await autoCreateCardEnabled(admin)) {
      await placeLeadInDefaultPipeline(admin, leadId);
    }
  } catch {
    // nunca derruba a ingestão
  }

  try {
    const { data: avLead } = await admin
      .from("leads")
      .select("id, phone, avatar_url, avatar_id, avatar_checked_at")
      .eq("id", leadId)
      .maybeSingle();
    if (avLead) await ensureLeadAvatar(admin, avLead as AvatarLead);
  } catch {
    // foto nunca pode derrubar a ingestão
  }

  if (!fromMe) {
    try {
      await runReplyAutomations(admin, leadId);
    } catch (e) {
      console.log("[WH] automação de resposta falhou:", (e as Error).message);
    }
  }

  return { ok: true, stored: true, media: media_type };
}
