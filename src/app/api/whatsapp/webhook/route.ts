import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { onlyDigits, downloadMedia } from "@/lib/services/whatsapp/dinastia";
import { runReplyAutomations } from "@/lib/automations/engine";
import { ensureLeadAvatar, type AvatarLead } from "@/lib/services/whatsapp/avatar";
import { isPhoneLikeName } from "@/lib/services/whatsapp/names";
import { ensureActiveSession } from "@/lib/chat-sessions/ensure-active-session";
import type { SupabaseClient } from "@supabase/supabase-js";

// Configurações do número (org_settings.chat) com cache de 60s — o webhook
// roda a cada mensagem, não precisa bater no banco toda vez.
let settingsCache: { at: number; autoCard: boolean } = { at: 0, autoCard: false };
async function autoCreateCardEnabled(admin: SupabaseClient): Promise<boolean> {
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

/** Coloca o lead no topo da 1ª etapa do funil padrão (nunca CS). */
async function placeInDefaultPipeline(admin: SupabaseClient, leadId: string) {
  const { data: lead } = await admin
    .from("leads")
    .select("pipeline_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead || lead.pipeline_id) return; // já tem card

  const { data: pipeline } = await admin
    .from("pipelines")
    .select("id")
    .eq("archived", false)
    .eq("is_cs", false)
    .order("is_default", { ascending: false })
    .order("position")
    .limit(1)
    .maybeSingle();
  if (!pipeline) return;
  const { data: stage } = await admin
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_id", pipeline.id)
    .order("position")
    .limit(1)
    .maybeSingle();
  if (!stage) return;
  const { data: top } = await admin
    .from("leads")
    .select("position")
    .eq("stage_id", stage.id)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  await admin
    .from("leads")
    .update({
      pipeline_id: pipeline.id,
      stage_id: stage.id,
      stage_changed_at: new Date().toISOString(),
      position: top ? top.position - 1 : 0,
    })
    .eq("id", leadId);
}

// DinastiAPI (wuzapi) chama este endpoint quando chega mensagem.
// Protegido por ?secret= (WHATSAPP_WEBHOOK_SECRET).
// Aceita JSON e form-encoded (campo jsonData), que é o padrão wuzapi.

export async function POST(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  // Fail-closed: sem secret configurado OU secret errado → 401.
  const provided =
    url.searchParams.get("secret") || req.headers.get("x-webhook-secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Multi-número: cada instância aponta pro webhook com ?n=<wa_numbers.id>;
  // sem o parâmetro é a instância principal (number_id null).
  const nParam = url.searchParams.get("n");
  const numberId =
    nParam && /^[0-9a-f-]{36}$/i.test(nParam) ? nParam : null;

  const ct = req.headers.get("content-type") || "";
  const raw = await req.text();
  // NUNCA logar o payload em produção: contém conteúdo de mensagens + telefones (PII/LGPD).
  if (process.env.NODE_ENV !== "production") {
    console.log("[WH] ct=", ct, "len=", raw.length, "raw=", raw.slice(0, 1500));
  }

  // Extrai o payload JSON, seja JSON puro ou form-encoded (jsonData)
  let payload: Record<string, any> = {};
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };
  if (ct.includes("application/json")) {
    payload = tryParse(raw) ?? {};
  } else {
    const params = new URLSearchParams(raw);
    const jd = params.get("jsonData") || params.get("data") || params.get("body");
    payload = (jd && tryParse(jd)) || tryParse(raw) || {};
  }

  // DinastiAPI: evento em payload.data.event (fallback p/ payload.event)
  const event: Record<string, any> =
    payload?.data?.event ?? payload?.event ?? payload ?? {};
  const info: Record<string, any> = event?.Info ?? {};
  const msg: Record<string, any> = event?.Message ?? {};

  // --- HistorySync (import de histórico via /sync/full-history) ---
  // Dispara quando alguém chama requestFullHistorySync(); o WhatsApp manda
  // chunks de conversas/mensagens que precisamos ingerir aqui.
  const evType = String(payload?.data?.type ?? payload?.type ?? "").toLowerCase();
  if (evType.includes("history")) {
    return await handleHistorySync(payload);
  }

  // --- ReadReceipt -> status (entregue/lido) ---
  const receiptType = payload?.data?.type ?? (payload as any)?.eventType ?? "";
  if (receiptType === "ReadReceipt") {
    const ids: string[] =
      payload?.data?.event?.MessageIDs ?? event?.MessageIDs ?? [];
    const t = String(
      payload?.data?.event?.Type ?? payload?.data?.state ?? ""
    ).toLowerCase();
    if (ids.length && (t.includes("read") || t.includes("deliver"))) {
      const admin = createAdminClient();
      if (t.includes("read")) {
        await admin
          .from("whatsapp_messages")
          .update({ status: "read" })
          .in("provider_msg_id", ids)
          .neq("status", "read");
      } else {
        await admin
          .from("whatsapp_messages")
          .update({ status: "delivered" })
          .in("provider_msg_id", ids)
          .eq("status", "sent");
      }
      // Quem entregou/leu uma mensagem NOSSA é o próprio contato → aprende o
      // wa_lid dele aqui, mesmo que ele nunca tenha mandado mensagem (senão o
      // "digitando" dele chega com lid desconhecido e é descartado).
      const receiptLidJid = [event?.Sender, event?.SenderAlt, event?.Chat]
        .map((v) => String(v ?? ""))
        .find((j) => j.endsWith("@lid"));
      const receiptLid = receiptLidJid
        ? receiptLidJid.split("@")[0].split(":")[0]
        : "";
      if (receiptLid) {
        const { data: row } = await admin
          .from("whatsapp_messages")
          .select("lead_id")
          .in("provider_msg_id", ids)
          .eq("direction", "out")
          .limit(1)
          .maybeSingle();
        const leadId = (row as { lead_id: string } | null)?.lead_id;
        if (leadId) {
          await admin
            .from("leads")
            .update({ wa_lid: receiptLid })
            .eq("id", leadId)
            .is("wa_lid", null);
        }
      }
    }
    return NextResponse.json({ ok: true, receipt: t });
  }

  // --- ChatPresence: contato digitando/parou → upsert efêmero pra UI ---
  const presenceType = String(
    payload?.data?.type ?? (payload as Record<string, unknown>)?.type ?? ""
  );

  if (presenceType === "ChatPresence") {
    // O evento de presença vem SÓ com o @lid (SenderAlt chega vazio aqui).
    // Resolve: 1) pelo telefone se algum campo trouxer @s.whatsapp.net;
    // 2) senão pelo mapa wa_lid aprendido das mensagens.
    const cands = [
      event?.SenderAlt,
      event?.RecipientAlt,
      event?.Sender,
      event?.Chat,
    ]
      .map((v) => String(v ?? ""))
      .filter(Boolean);
    const state = String(event?.State ?? "").toLowerCase();

    if (state === "composing" || state === "paused") {
      const admin = createAdminClient();
      let presLeadId: string | null = null;

      const phoneJid = cands.find((j) => j.endsWith("@s.whatsapp.net"));
      if (phoneJid) {
        const digits = phoneJid.split("@")[0].split(":")[0].replace(/\D/g, "");
        // variações BR do 9º dígito: 55 DDD 9XXXXXXXX <-> 55 DDD XXXXXXXX
        const candidates = new Set<string>([digits]);
        if (digits.startsWith("55")) {
          if (digits.length === 13)
            candidates.add(digits.slice(0, 4) + digits.slice(5));
          if (digits.length === 12)
            candidates.add(digits.slice(0, 4) + "9" + digits.slice(4));
        }
        const { data: lead } = await admin
          .from("leads")
          .select("id")
          .in("phone", [...candidates])
          .limit(1)
          .maybeSingle();
        presLeadId = (lead as { id: string } | null)?.id ?? null;
      }

      if (!presLeadId) {
        const lidJid = cands.find((j) => j.endsWith("@lid"));
        const lid = lidJid ? lidJid.split("@")[0].split(":")[0] : "";
        if (lid) {
          const { data: lead } = await admin
            .from("leads")
            .select("id")
            .eq("wa_lid", lid)
            .limit(1)
            .maybeSingle();
          presLeadId = (lead as { id: string } | null)?.id ?? null;
          if (!presLeadId) {
            // lid desconhecido (contato salvo que nunca mandou mensagem):
            // cruza a agenda na hora e persiste o aprendizado.
            const { resolveLidToLead } = await import("@/lib/services/whatsapp/lids");
            const { tokenForNumberId } = await import(
              "@/lib/services/whatsapp/numbers"
            );
            const authToken = numberId
              ? await tokenForNumberId(numberId)
              : undefined;
            presLeadId = await resolveLidToLead(admin, lid, authToken);
          }
        }
      }

      if (presLeadId) {
        await admin.from("chat_presence").upsert({
          lead_id: presLeadId,
          state,
          at: new Date().toISOString(),
        });
      }
    }
    return NextResponse.json({ ok: true, presence: state });
  }

  // --- Reação recebida ---
  if (msg.reactionMessage) {
    const targetId =
      msg.reactionMessage?.key?.id ?? msg.reactionMessage?.key?.ID ?? null;
    const emoji = msg.reactionMessage?.text ?? "";
    if (targetId) {
      const admin = createAdminClient();
      await admin
        .from("whatsapp_messages")
        .update({ reaction: emoji || null })
        .eq("provider_msg_id", targetId);
    }
    return NextResponse.json({ ok: true, reaction: true });
  }

  // Pula grupos e status/broadcast — mas MANTÉM IsFromMe (echo: msgs que você
  // mandou pelo celular também entram na conversa, espelhando o WhatsApp).
  const chatJid = String(info.Chat ?? "");
  if (
    info.IsGroup === true ||
    chatJid.includes("@g.us") ||
    chatJid.includes("broadcast")
  ) {
    return NextResponse.json({ ok: true, ignored: "group-or-broadcast" });
  }

  const fromMe = info.IsFromMe === true;

  // Telefone do LEAD = a OUTRA ponta (o cliente). O WhatsApp anonimiza em @lid;
  // o número real fica em SenderAlt (entrada) ou RecipientAlt (quando é fromMe).
  // Prioridade igual ao fluxo da MAIA: Chat > SenderAlt > RecipientAlt > Sender.
  const phone = onlyDigits(
    (() => {
      for (const c of [info.Chat, info.SenderAlt, info.RecipientAlt, info.Sender]) {
        const s = String(c ?? "");
        // JID = "5599...@s.whatsapp.net", mas pode vir "5599...:16@..." onde :16
        // é o ID do APARELHO — tem que tirar antes dos dígitos, senão gruda no fone.
        if (s.includes("@s.whatsapp.net")) return s.split("@")[0].split(":")[0];
      }
      return "";
    })()
  );
  if (!phone) {
    return NextResponse.json({ ok: true, ignored: "no-real-phone" });
  }

  // Mensagens enviadas pelo celular vêm aninhadas em deviceSentMessage/ephemeral.
  let mc: Record<string, any> = msg;
  if (mc.deviceSentMessage?.message) mc = mc.deviceSentMessage.message;
  if (mc.ephemeralMessage?.message) mc = mc.ephemeralMessage.message;
  if (mc.viewOnceMessageV2?.message) mc = mc.viewOnceMessageV2.message;

  // Conteúdo: texto e/ou mídia
  let body: string | null =
    mc.conversation ?? mc.extendedTextMessage?.text ?? null;
  let mediaKind: "image" | "audio" | "video" | "document" | null = null;
  let node: Record<string, any> | null = null;
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
    // sticker usa chave de criptografia própria (não dá pra baixar como imagem)
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
      String(mc.contactMessage.vcard ?? "").match(/TEL[^:]*:([+\d][\d\s()-]+)/)?.[1] ??
      "";
    body = body ?? `👤 Contato: ${dn}${tel ? ` (${tel.trim()})` : ""}`;
  } else if (mc.contactsArrayMessage) {
    const names = (mc.contactsArrayMessage.contacts ?? [])
      .map((c: Record<string, any>) => c.displayName)
      .filter(Boolean)
      .join(", ");
    body = body ?? `👤 Contatos: ${names || "—"}`;
  }

  if (!body && !mediaKind) {
    return NextResponse.json({ ok: true, ignored: "no-content" });
  }

  const admin = createAdminClient();

  // Dedup precoce: se já temos essa mensagem (ex.: enviada pelo app e agora
  // ecoada de volta como fromMe), nem processa — evita duplicar e baixar mídia.
  const msgId = info.ID ?? info.id ?? null;
  if (msgId) {
    const { data: dup } = await admin
      .from("whatsapp_messages")
      .select("id")
      .eq("provider_msg_id", msgId)
      .limit(1)
      .maybeSingle();
    if (dup) return NextResponse.json({ ok: true, duplicate: true });
  }

  // Acha-ou-cria lead de forma ATÔMICA (dedup por número canônico no banco:
  // trata corrida e variações de formato — impossível duplicar). Em fromMe o
  // PushName é o SEU nome (não do cliente), então não usa como nome do lead.
  const pushName = fromMe
    ? ""
    : String(
        info.PushName ?? (payload as { pushName?: string })?.pushName ?? ""
      ).trim();
  const { data: leadId, error: rpcErr } = await admin.rpc(
    "wa_find_or_create_lead",
    { p_phone: phone, p_name: pushName, p_sector: "vendas" }
  );
  if (rpcErr || !leadId) {
    console.log("[WH] find_or_create lead falhou:", rpcErr?.message);
    return NextResponse.json({ ok: true, ignored: "lead-resolve-failed" });
  }

  // Aprende o @lid do contato: a presença ("digitando") chega SÓ com o lid,
  // então guardamos o par lid↔lead sempre que uma mensagem trouxer os dois.
  const lidJid = [info.Chat, info.Sender]
    .map((v) => String(v ?? ""))
    .find((s) => s.endsWith("@lid"));
  if (lidJid && !fromMe) {
    const lid = lidJid.split("@")[0].split(":")[0];
    if (lid) {
      await admin
        .from("leads")
        .update({ wa_lid: lid })
        .eq("id", leadId)
        .or(`wa_lid.is.null,wa_lid.neq.${lid}`);
    }
  }

  // Tratamento do nome: contato criado antes do PushName chegar fica salvo
  // como número — na primeira mensagem que trouxer o nome, corrige. Nunca
  // sobrescreve um nome de verdade (editado à mão ou já correto).
  if (pushName && !isPhoneLikeName(pushName)) {
    const { data: cur } = await admin
      .from("leads")
      .select("name")
      .eq("id", leadId)
      .maybeSingle();
    const curName = String((cur as { name?: string } | null)?.name ?? "").trim();
    if (isPhoneLikeName(curName) && curName !== pushName) {
      await admin.from("leads").update({ name: pushName }).eq("id", leadId);
    }
  }

  // Mídia recebida: baixa e sobe no Storage
  let media_url: string | null = null;
  let media_type: string | null = null;
  if (mediaKind && node) {
    const dl = await downloadMedia(mediaKind, node);
    if (dl) {
      const ext = (dl.mime.split("/")[1] || "bin").split(";")[0];
      const dir = fromMe ? "out" : "in";
      const path = `${leadId}/${dir}-${Date.now()}.${ext}`;
      const { error: upErr } = await admin.storage
        .from("whatsapp-media")
        .upload(path, dl.buffer, { contentType: dl.mime });
      if (!upErr) {
        media_url = admin.storage.from("whatsapp-media").getPublicUrl(path)
          .data.publicUrl;
        media_type = mediaKind;
      } else {
        console.log("[WH] upload erro:", upErr.message);
      }
    }
  }

  // Citação (responder mensagem): guarda o trecho da citada pra bolha.
  // Procura a original pelo stanzaID; sem achar, usa o texto que o próprio
  // WhatsApp manda dentro do contextInfo.quotedMessage.
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
      reply_to_body = (q.body ?? (q.media_type ? "[mídia]" : "")).slice(0, 180) || null;
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
      leadId: leadId as string,
      numberId,
      direction: fromMe ? "out" : "in",
    });
    sessionId = sess.sessionId;
  } catch (e) {
    console.log("[WH] sessão falhou (msg segue):", (e as Error).message);
  }

  // fromMe = você respondeu pelo celular → registra como saída (echo).
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
    // falha real de gravação → 500 pro wuzapi reentregar (senão a mensagem
    // do cliente se perde sem rastro)
    console.log("[WH][ERR] insert mensagem falhou:", insErr.message);
    return NextResponse.json(
      { ok: false, error: "insert-failed" },
      { status: 500 }
    );
  }

  await admin
    .from("leads")
    .update({ last_contact_at: new Date().toISOString() })
    .eq("id", leadId);

  // "Criar card automaticamente" ligado nas Configurações do número?
  // → contato sem card entra direto no funil padrão.
  try {
    if (await autoCreateCardEnabled(admin)) {
      await placeInDefaultPipeline(admin, leadId as string);
    }
  } catch {
    // nunca derruba a ingestão
  }

  // Foto de perfil: puxa na hora pra lead novo/sem foto (e revisa semanalmente).
  // O frescor interno evita chamar a instância a cada mensagem.
  try {
    const { data: avLead } = await admin
      .from("leads")
      .select("id, phone, avatar_url, avatar_id, avatar_checked_at")
      .eq("id", leadId)
      .maybeSingle();
    if (avLead) await ensureLeadAvatar(admin, avLead as AvatarLead);
  } catch {
    // foto nunca pode derrubar a ingestão da mensagem
  }

  // Automação por evento: só quando o CLIENTE responde (não no echo do próprio
  // celular). Move o card se houver regra 'reply_received' na etapa. Blindado:
  // nunca deixa a automação derrubar a ingestão da mensagem.
  if (!fromMe) {
    try {
      await runReplyAutomations(admin, leadId as string);
    } catch (e) {
      console.log("[WH] automação de resposta falhou:", (e as Error).message);
    }
  }

  return NextResponse.json({ ok: true, stored: true, media: media_type });
}

// =================== HistorySync ===================
// Estrutura típica (whatsmeow): Data.conversations[] com Messages[].
// Como o JSON varia entre versões, tento várias paths defensivamente.

type AnyObj = Record<string, any>;

function pick<T = unknown>(obj: AnyObj | undefined, ...paths: string[]): T | null {
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

async function handleHistorySync(payload: AnyObj) {
  const ev: AnyObj = payload?.data?.event ?? payload?.event ?? payload ?? {};
  // O payload vem em vários formatos; pego o array de conversas onde achar.
  const conversations: AnyObj[] =
    pick<AnyObj[]>(ev, "Data.conversations", "Data.Conversations", "conversations", "Conversations", "data.conversations") ??
    [];
  const syncType = String(
    pick<string>(ev, "Data.syncType", "syncType", "Type", "Data.Type") ?? ""
  );
  console.log("[WH/HistorySync] type=", syncType, "convs=", conversations.length);

  if (!conversations.length) {
    return NextResponse.json({ ok: true, history: { conversations: 0 } });
  }

  const admin = createAdminClient();

  // Pipeline padrão (pra criar leads novos)
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
    return NextResponse.json({ ok: true, ignored: "no-pipeline-stage" });
  }

  let leadsCreated = 0;
  let messagesInserted = 0;
  let messagesSkipped = 0;

  for (const conv of conversations) {
    const cid = String(pick<string>(conv, "id", "ID", "Id") ?? "");
    // Ignora grupos, status, LIDs (não conseguimos resolver pra um lead 1:1)
    if (!cid || cid.includes("@g.us") || cid.includes("@broadcast") || cid.includes("@lid") || cid.includes("status@")) {
      continue;
    }
    // tira o @dominio e o :device antes dos dígitos
    const phone = onlyDigits((cid.split("@")[0] ?? "").split(":")[0]);
    if (!phone) continue;

    // Acha-ou-cria atômico (mesma dedup por número canônico do fluxo em tempo real)
    const convName = String(
      pick<string>(conv, "name", "Name", "displayName", "DisplayName") ?? ""
    ).trim();
    const { data: leadId, error: cErr } = await admin.rpc(
      "wa_find_or_create_lead",
      { p_phone: phone, p_name: convName, p_sector: "vendas" }
    );
    if (cErr || !leadId) {
      console.log("[WH/HistorySync] resolver lead falhou:", cErr?.message);
      continue;
    }

    // Mensagens da conversa
    const msgs: AnyObj[] = pick<AnyObj[]>(conv, "messages", "Messages") ?? [];
    if (!msgs.length) continue;

    const rows: AnyObj[] = [];
    for (const m of msgs) {
      // o wrapper pode ser m.message ou m.Message
      const wm: AnyObj = pick<AnyObj>(m, "message", "Message") ?? m;
      const key: AnyObj = pick<AnyObj>(wm, "key", "Key") ?? {};
      const msgId = String(pick<string>(key, "id", "ID", "Id") ?? "");
      if (!msgId) continue;
      const fromMe = !!pick<boolean>(key, "fromMe", "FromMe");
      const tsRaw = pick<number | string>(wm, "messageTimestamp", "MessageTimestamp");
      const ts = typeof tsRaw === "number" ? tsRaw : Number(tsRaw ?? 0);
      const createdAt = ts > 0 ? new Date(ts * 1000).toISOString() : null;
      const mc: AnyObj = pick<AnyObj>(wm, "message", "Message") ?? {};

      let body: string | null =
        pick<string>(mc, "conversation", "extendedTextMessage.text", "imageMessage.caption", "videoMessage.caption", "documentMessage.caption") ?? null;
      let media_type: string | null = null;
      if (mc.imageMessage) media_type = "image";
      else if (mc.audioMessage) media_type = "audio";
      else if (mc.videoMessage) media_type = "video";
      else if (mc.documentMessage) media_type = "document";
      else if (mc.stickerMessage) media_type = "sticker";

      if (!body && !media_type) continue; // mensagem sem conteúdo útil

      rows.push({
        lead_id: leadId,
        direction: fromMe ? "out" : "in",
        body,
        media_url: null, // download de mídia histórica é caro; skip por ora
        media_type,
        status: fromMe ? "sent" : "received",
        provider: "dinastia",
        provider_msg_id: msgId,
        created_at: createdAt ?? new Date().toISOString(),
      });
    }

    if (rows.length === 0) continue;
    // Upsert em lote por provider_msg_id (índice único parcial) → idempotente
    const { error: upErr, count } = await admin
      .from("whatsapp_messages")
      .upsert(rows, { onConflict: "provider_msg_id", ignoreDuplicates: true, count: "exact" });
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
  return NextResponse.json({
    ok: true,
    history: {
      conversations: conversations.length,
      leadsCreated,
      messagesInserted,
    },
  });
}
