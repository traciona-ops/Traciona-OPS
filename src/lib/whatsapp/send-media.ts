import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sendMedia,
  convertAudio,
  type MediaKind,
} from "@/lib/services/whatsapp/dinastia";
import { resolveLeadNumber } from "@/lib/services/whatsapp/numbers";
import {
  persistOutboundMessage,
  touchLastContact,
} from "@/lib/whatsapp/persist-outbound";

export async function sendWhatsappMediaDomain(
  db: SupabaseClient,
  admin: SupabaseClient,
  input: {
    leadId: string;
    caption: string;
    file: File;
    sentBy: string | null;
  }
): Promise<{ ok: true } | { error: string }> {
  const { leadId, caption, file, sentBy } = input;

  const { data: lead } = await db
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();
  if (!lead?.phone) return { error: "Lead sem telefone." };

  const mime = file.type || "application/octet-stream";
  const kind: MediaKind = mime.startsWith("image/")
    ? "image"
    : mime.startsWith("audio/")
      ? "audio"
      : mime.startsWith("video/")
        ? "video"
        : "document";

  const buf = Buffer.from(await file.arrayBuffer());

  const safeName = (file.name || "arquivo").replace(/[^\w.\-]/g, "_");
  const path = `${leadId}/${Date.now()}-${safeName}`;
  const { error: upErr } = await admin.storage
    .from("whatsapp-media")
    .upload(path, buf, { contentType: mime, upsert: false });
  if (upErr) return { error: `Upload falhou: ${upErr.message}` };
  const publicUrl = admin.storage.from("whatsapp-media").getPublicUrl(path)
    .data.publicUrl;

  let payload = `data:${mime};base64,${buf.toString("base64")}`;
  if (kind === "audio") {
    const signed = await admin.storage
      .from("whatsapp-media")
      .createSignedUrl(path, 300);
    const converted = await convertAudio(
      signed.data?.signedUrl ?? publicUrl,
      mime
    );
    if (converted) payload = converted;
  }
  const { numberId, token: authToken } = await resolveLeadNumber(leadId);
  const result = await sendMedia(
    lead.phone,
    kind,
    payload,
    {
      caption,
      fileName: file.name,
      mime,
    },
    authToken
  );

  await persistOutboundMessage(db, {
    leadId,
    numberId,
    body: caption || null,
    media_url: publicUrl,
    media_type: kind,
    status: result.ok ? "sent" : "failed",
    provider_msg_id: result.ok ? result.id : null,
    sent_by: sentBy,
  });

  if (result.ok) {
    await touchLastContact(db, leadId);
  }

  return result.ok ? { ok: true } : { error: `Falha no envio: ${result.error}` };
}
