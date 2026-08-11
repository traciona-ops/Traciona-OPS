import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseWebhookBody, unwrapWebhookEvent } from "@/lib/whatsapp/parse-payload";
import { handleReadReceipt } from "@/lib/whatsapp/receipts";
import { handleChatPresence } from "@/lib/whatsapp/presence";
import { handleInboundReaction } from "@/lib/whatsapp/reactions";
import { ingestLiveMessage } from "@/lib/whatsapp/ingest-message";
import { handleHistorySync } from "@/lib/whatsapp/ingest-history";

// DinastiAPI (wuzapi) chama este endpoint quando chega mensagem.
// Protegido por ?secret= (WHATSAPP_WEBHOOK_SECRET).
// Aceita JSON e form-encoded (campo jsonData), que é o padrão wuzapi.
// Domínio de ingestão: src/lib/whatsapp/*

export async function POST(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  const provided =
    url.searchParams.get("secret") || req.headers.get("x-webhook-secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const nParam = url.searchParams.get("n");
  const numberId =
    nParam && /^[0-9a-f-]{36}$/i.test(nParam) ? nParam : null;

  const ct = req.headers.get("content-type") || "";
  const raw = await req.text();
  if (process.env.NODE_ENV !== "production") {
    console.log("[WH] ct=", ct, "len=", raw.length, "raw=", raw.slice(0, 1500));
  }

  const payload = parseWebhookBody(ct, raw);
  const { event, info, msg, evType, typeField } = unwrapWebhookEvent(payload);
  const admin = createAdminClient();

  if (evType.includes("history")) {
    const r = await handleHistorySync(admin, payload);
    return NextResponse.json(r);
  }

  if (typeField === "ReadReceipt") {
    const r = await handleReadReceipt(admin, payload, event);
    return NextResponse.json({ ok: true, receipt: r.handled ? r.receipt : "" });
  }

  if (typeField === "ChatPresence") {
    const r = await handleChatPresence(admin, event, numberId);
    return NextResponse.json({ ok: true, presence: r.presence });
  }

  if (msg.reactionMessage) {
    await handleInboundReaction(admin, msg);
    return NextResponse.json({ ok: true, reaction: true });
  }

  const result = await ingestLiveMessage(admin, {
    numberId,
    payload,
    info,
    msg,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status }
    );
  }
  if ("ignored" in result) {
    return NextResponse.json({ ok: true, ignored: result.ignored });
  }
  if ("duplicate" in result) {
    return NextResponse.json({ ok: true, duplicate: true });
  }
  return NextResponse.json({
    ok: true,
    stored: true,
    media: result.media,
  });
}
