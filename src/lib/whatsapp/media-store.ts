import type { SupabaseClient } from "@supabase/supabase-js";
import { downloadMedia } from "@/lib/services/whatsapp/dinastia";

export async function storeInboundMedia(
  admin: SupabaseClient,
  opts: {
    leadId: string;
    fromMe: boolean;
    mediaKind: "image" | "audio" | "video" | "document";
    node: Record<string, any>;
  }
): Promise<{ media_url: string; media_type: string } | null> {
  const { leadId, fromMe, mediaKind, node } = opts;
  const dl = await downloadMedia(mediaKind, node);
  if (!dl) return null;
  const ext = (dl.mime.split("/")[1] || "bin").split(";")[0];
  const dir = fromMe ? "out" : "in";
  const path = `${leadId}/${dir}-${Date.now()}.${ext}`;
  const { error: upErr } = await admin.storage
    .from("whatsapp-media")
    .upload(path, dl.buffer, { contentType: dl.mime });
  if (upErr) {
    console.log("[WH] upload erro:", upErr.message);
    return null;
  }
  return {
    media_url: admin.storage.from("whatsapp-media").getPublicUrl(path).data
      .publicUrl,
    media_type: mediaKind,
  };
}
