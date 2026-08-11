import type { SupabaseClient } from "@supabase/supabase-js";
import { onlyDigits } from "@/lib/services/whatsapp/dinastia";
import { findOrCreateWaLead } from "@/lib/whatsapp/leads";

type AnyObj = Record<string, any>;

function pick<T = unknown>(
  obj: AnyObj | undefined,
  ...paths: string[]
): T | null {
  if (!obj) return null;
  for (const path of paths) {
    let cur: any = obj;
    for (const k of path.split(".")) {
      if (cur == null) break;
      cur = cur[k];
    }
    if (cur !== undefined && cur !== null) return cur as T;
  }
  return null;
}

export type HistorySyncResult = {
  ok: true;
  history?: {
    conversations: number;
    leadsCreated?: number;
    messagesInserted?: number;
  };
  ignored?: string;
};

/** HistorySync (requestFullHistorySync) — upsert idempotente por provider_msg_id. */
export async function handleHistorySync(
  admin: SupabaseClient,
  payload: AnyObj
): Promise<HistorySyncResult> {
  const ev: AnyObj = payload?.data?.event ?? payload?.event ?? payload ?? {};
  const conversations: AnyObj[] =
    pick<AnyObj[]>(
      ev,
      "Data.conversations",
      "Data.Conversations",
      "conversations",
      "Conversations",
      "data.conversations"
    ) ?? [];
  const syncType = String(
    pick<string>(ev, "Data.syncType", "syncType", "Type", "Data.Type") ?? ""
  );
  console.log(
    "[WH/HistorySync] type=",
    syncType,
    "convs=",
    conversations.length
  );

  if (!conversations.length) {
    return { ok: true, history: { conversations: 0 } };
  }

  const { data: pipeline } = await admin
    .from("pipelines")
    .select("id")
    .eq("archived", false)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  const { data: firstStage } = pipeline
    ? await admin
        .from("pipeline_stages")
        .select("id")
        .eq("pipeline_id", pipeline.id)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle()
    : { data: null };
  if (!pipeline || !firstStage) {
    return { ok: true, ignored: "no-pipeline-stage" };
  }

  const leadsCreated = 0;
  let messagesInserted = 0;
  let messagesSkipped = 0;

  for (const conv of conversations) {
    const cid = String(pick<string>(conv, "id", "ID", "Id") ?? "");
    if (
      !cid ||
      cid.includes("@g.us") ||
      cid.includes("@broadcast") ||
      cid.includes("@lid") ||
      cid.includes("status@")
    ) {
      continue;
    }
    const phone = onlyDigits((cid.split("@")[0] ?? "").split(":")[0]);
    if (!phone) continue;

    const convName = String(
      pick<string>(conv, "name", "Name", "displayName", "DisplayName") ?? ""
    ).trim();
    const resolved = await findOrCreateWaLead(admin, phone, convName);
    if ("error" in resolved) {
      console.log("[WH/HistorySync] resolver lead falhou:", resolved.error);
      continue;
    }
    const { leadId } = resolved;

    const msgs: AnyObj[] = pick<AnyObj[]>(conv, "messages", "Messages") ?? [];
    if (!msgs.length) continue;

    const rows: AnyObj[] = [];
    for (const m of msgs) {
      const wm: AnyObj = pick<AnyObj>(m, "message", "Message") ?? m;
      const key: AnyObj = pick<AnyObj>(wm, "key", "Key") ?? {};
      const msgId = String(pick<string>(key, "id", "ID", "Id") ?? "");
      if (!msgId) continue;
      const fromMe = !!pick<boolean>(key, "fromMe", "FromMe");
      const tsRaw = pick<number | string>(
        wm,
        "messageTimestamp",
        "MessageTimestamp"
      );
      const ts = typeof tsRaw === "number" ? tsRaw : Number(tsRaw ?? 0);
      const createdAt = ts > 0 ? new Date(ts * 1000).toISOString() : null;
      const mc: AnyObj = pick<AnyObj>(wm, "message", "Message") ?? {};

      let body: string | null =
        pick<string>(
          mc,
          "conversation",
          "extendedTextMessage.text",
          "imageMessage.caption",
          "videoMessage.caption",
          "documentMessage.caption"
        ) ?? null;
      let media_type: string | null = null;
      if (mc.imageMessage) media_type = "image";
      else if (mc.audioMessage) media_type = "audio";
      else if (mc.videoMessage) media_type = "video";
      else if (mc.documentMessage) media_type = "document";
      else if (mc.stickerMessage) media_type = "sticker";

      if (!body && !media_type) continue;

      rows.push({
        lead_id: leadId,
        direction: fromMe ? "out" : "in",
        body,
        media_url: null,
        media_type,
        status: fromMe ? "sent" : "received",
        provider: "dinastia",
        provider_msg_id: msgId,
        created_at: createdAt ?? new Date().toISOString(),
      });
    }

    if (rows.length === 0) continue;
    const { error: upErr, count } = await admin
      .from("whatsapp_messages")
      .upsert(rows, {
        onConflict: "provider_msg_id",
        ignoreDuplicates: true,
        count: "exact",
      });
    if (upErr) {
      console.log("[WH/HistorySync] upsert err:", upErr.message);
      messagesSkipped += rows.length;
    } else {
      messagesInserted += count ?? rows.length;
    }
  }

  console.log(
    "[WH/HistorySync] resumo: convs=",
    conversations.length,
    "leads_novos=",
    leadsCreated,
    "msgs_inseridas=",
    messagesInserted,
    "msgs_skip=",
    messagesSkipped
  );
  return {
    ok: true,
    history: {
      conversations: conversations.length,
      leadsCreated,
      messagesInserted,
    },
  };
}
