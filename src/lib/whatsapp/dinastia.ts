// Adaptador DinastiAPI (wuzapi). Server-only.
// Auth: header `token`. Endpoints na raiz da base URL.
// Circuit breaker: failureThreshold=5, timeout=60s → previne cascata de falhas.

import { withCircuitBreaker } from "@/lib/circuit-breaker";

const BASE = process.env.WHATSAPP_API_URL;
const TOKEN = process.env.WHATSAPP_API_TOKEN;
const ADMIN_TOKEN = process.env.DINASTIAPI_ADMIN_TOKEN;

// Multi-número: cada função aceita um token de instância opcional;
// sem ele, usa a instância principal do env (compatível com tudo que existia).
function headers(authToken?: string) {
  return {
    "Content-Type": "application/json",
    token: authToken ?? TOKEN ?? "",
  };
}

export function onlyDigits(phone: string): string {
  return (phone ?? "").replace(/\D/g, "");
}

export type SendResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

/**
 * Resolve o JID correto no WhatsApp (trata o 9º dígito brasileiro e valida o número).
 * Retorna os dígitos do número canônico, ou null se não estiver no WhatsApp.
 */
export async function resolvePhone(
  number: string,
  authToken?: string
): Promise<string | null> {
  if (!BASE || !TOKEN) return null;
  try {
    return await withCircuitBreaker(
      "dinastia",
      async () => {
        const res = await fetch(`${BASE}/user/check`, {
          method: "POST",
          headers: headers(authToken),
          body: JSON.stringify({ Phone: [number] }),
          // Sem timeout, uma instância travada pendura o cron inteiro.
          signal: AbortSignal.timeout(15000),
        });
        const json = await res.json().catch(() => ({}));
        const u = json?.data?.Users?.[0];
        if (u?.IsInWhatsapp && u?.JID) {
          return String(u.JID).split("@")[0] || null;
        }
        return null;
      },
      5,
      60000
    );
  } catch {
    return null;
  }
}

export async function sendText(
  phone: string,
  body: string,
  authToken?: string,
  quote?: { stanzaId: string; fromMe: boolean }
): Promise<SendResult> {
  if (!BASE || !TOKEN) return { ok: false, error: "WhatsApp não configurado." };
  const number = onlyDigits(phone);
  if (!number) return { ok: false, error: "Lead sem telefone válido." };

  // Resolve o número canônico (9º dígito BR) e valida que tem WhatsApp
  const resolved = await resolvePhone(number, authToken);
  if (!resolved) {
    return { ok: false, error: "Número não está no WhatsApp." };
  }

  // Citação (responder mensagem): Participant = autor da mensagem citada.
  // Se a citada é NOSSA, precisa do nosso JID (vem do status da sessão);
  // sem conseguir resolver, envia sem citação — nunca bloqueia a mensagem.
  let contextInfo: { StanzaID: string; Participant: string } | null = null;
  if (quote?.stanzaId) {
    let participant = `${resolved}@s.whatsapp.net`;
    if (quote.fromMe) {
      const st = await getStatus(authToken);
      const jid = String(
        (st as { data?: { jid?: string } })?.data?.jid ?? ""
      );
      participant = jid
        ? `${jid.split(":")[0].split("@")[0]}@s.whatsapp.net`
        : "";
    }
    if (participant) {
      contextInfo = { StanzaID: quote.stanzaId, Participant: participant };
    }
  }

  try {
    const res = await fetch(`${BASE}/chat/send/text`, {
      method: "POST",
      headers: headers(authToken),
      body: JSON.stringify({
        Phone: resolved,
        Body: body,
        ...(contextInfo ? { ContextInfo: contextInfo } : {}),
      }),
      signal: AbortSignal.timeout(20000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.success === false) {
      return { ok: false, error: json?.error || `HTTP ${res.status}` };
    }
    const id =
      json?.data?.Id ?? json?.data?.id ?? json?.id ?? null;
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function postSend(
  path: string,
  payload: Record<string, unknown>,
  authToken?: string
): Promise<SendResult> {
  if (!BASE || !TOKEN) return { ok: false, error: "WhatsApp não configurado." };
  try {
    return await withCircuitBreaker(
      "dinastia",
      async () => {
        const res = await fetch(`${BASE}${path}`, {
          method: "POST",
          headers: headers(authToken),
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(30000),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.success === false) {
          throw new Error(json?.error || `HTTP ${res.status}`);
        }
        return { ok: true, id: json?.data?.Id ?? json?.data?.id ?? null };
      },
      5,
      60000
    );
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type MediaKind = "image" | "document" | "audio" | "video";

// Serviço da Dinastia que reencoda o áudio para OGG/Opus "limpo".
// Sem isso, a instância aceita ("Sent") mas NÃO entrega a nota de voz —
// o encoding do opus-recorder não passa no upload do WhatsApp.
const AUDIO_CONVERT_URL =
  "https://backend-whats-convert-api.jnsbgu.easypanel.host/convert/audio";

function audioInputType(mime?: string): string {
  const m = (mime || "").toLowerCase();
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("wav")) return "wav";
  return "ogg";
}

/**
 * Converte um áudio (por URL) para OGG/Opus que a instância entrega de fato.
 * Retorna um data URI (base64) pronto pra enviar, ou null se a conversão falhar.
 */
export async function convertAudio(
  url: string,
  mime?: string
): Promise<string | null> {
  try {
    const res = await fetch(AUDIO_CONVERT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({ data: url, input_type: audioInputType(mime), is_url: true }),
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => ({}));
    const data = json?.data;
    return typeof data === "string" && data.startsWith("data:") ? data : null;
  } catch {
    return null;
  }
}

export async function sendMedia(
  phone: string,
  kind: MediaKind,
  dataUri: string,
  opts: { caption?: string; fileName?: string; mime?: string } = {},
  authToken?: string
): Promise<SendResult> {
  const number = onlyDigits(phone);
  const resolved = await resolvePhone(number, authToken);
  if (!resolved) return { ok: false, error: "Número não está no WhatsApp." };

  if (kind === "image") {
    return postSend(
      "/chat/send/image",
      {
        Phone: resolved,
        Image: dataUri,
        Caption: opts.caption || "",
        MimeType: opts.mime,
      },
      authToken
    );
  }
  if (kind === "audio") {
    return postSend(
      "/chat/send/audio",
      { Phone: resolved, Audio: dataUri, PTT: true },
      authToken
    );
  }
  if (kind === "video") {
    return postSend(
      "/chat/send/video",
      {
        Phone: resolved,
        Video: dataUri,
        Caption: opts.caption || "",
        MimeType: opts.mime,
      },
      authToken
    );
  }
  return postSend(
    "/chat/send/document",
    {
      Phone: resolved,
      Document: dataUri,
      FileName: opts.fileName || "arquivo",
      Caption: opts.caption || "",
      MimeType: opts.mime,
    },
    authToken
  );
}

/**
 * Baixa mídia recebida. Recebe o nó da mensagem (imageMessage/audioMessage/etc,
 * camelCase do whatsmeow) e o tipo. Retorna bytes + mime, ou null.
 */
export async function downloadMedia(
  kind: "image" | "audio" | "video" | "document",
  node: Record<string, any>
): Promise<{ buffer: Buffer; mime: string } | null> {
  if (!BASE || !TOKEN || !node) return null;
  const payload = {
    Url: node.url ?? node.URL ?? node.Url,
    DirectPath: node.directPath ?? node.DirectPath,
    MediaKey: node.mediaKey ?? node.MediaKey,
    Mimetype: node.mimetype ?? node.Mimetype,
    FileEncSHA256: node.fileEncSha256 ?? node.fileEncSHA256 ?? node.FileEncSHA256,
    FileSHA256: node.fileSha256 ?? node.fileSHA256 ?? node.FileSHA256,
    FileLength: node.fileLength ?? node.FileLength,
  };
  try {
    const res = await fetch(`${BASE}/chat/download${kind}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(payload),
    });
    const ct = res.headers.get("content-type") || "";
    const mime = node.mimetype ?? node.Mimetype ?? "application/octet-stream";
    if (ct.includes("application/json")) {
      const json = await res.json().catch(() => ({}));
      const b64 =
        json?.data?.Data ?? json?.data?.data ?? json?.Data ?? json?.data;
      if (typeof b64 === "string" && b64.length > 0) {
        const clean = b64.includes(",") ? b64.split(",")[1] : b64;
        console.log("[WH] download json ok, len=", clean.length);
        return { buffer: Buffer.from(clean, "base64"), mime };
      }
      console.log("[WH] download json sem data. keys=", Object.keys(json?.data ?? json ?? {}));
      return null;
    }
    // resposta binária
    const ab = await res.arrayBuffer();
    return { buffer: Buffer.from(ab), mime: ct || mime };
  } catch (e) {
    console.log("[WH] download erro:", (e as Error).message);
    return null;
  }
}

export async function reactMessage(
  phone: string,
  messageId: string,
  emoji: string,
  fromMe: boolean
): Promise<SendResult> {
  const resolved = await resolvePhone(onlyDigits(phone));
  if (!resolved) return { ok: false, error: "Número inválido." };
  return postSend("/chat/react", {
    Phone: resolved,
    Id: fromMe ? `me:${messageId}` : messageId,
    Body: emoji, // string vazia remove a reação
  });
}

/**
 * Dispara FULL_HISTORY_SYNC_ON_DEMAND no WhatsApp. O retorno é só a confirmação
 * do request — o histórico chega ASSÍNCRONAMENTE no nosso webhook como eventos
 * "HistorySync" (processados em /api/whatsapp/webhook).
 */
export async function requestFullHistorySync(opts: {
  days?: number;
  sizeMb?: number;
  includeGroups?: boolean;
  includeCalls?: boolean;
}) {
  if (!BASE || !TOKEN) return { ok: false, error: "WhatsApp não configurado." };
  try {
    const res = await fetch(`${BASE}/sync/full-history`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        days_limit: opts.days ?? 7,
        size_mb_limit: opts.sizeMb ?? 200,
        include_groups: opts.includeGroups ?? false,
        include_calls: opts.includeCalls ?? false,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json?.error ?? `HTTP ${res.status}` };
    return {
      ok: true,
      requestId: (json?.data?.request_id ?? null) as string | null,
      message: (json?.data?.message ?? null) as string | null,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Foto de perfil de um contato. Usa /user/contact/info (traz a foto em base64 —
 * mais confiável que /user/avatar, que dá 500 falso pra vários números).
 * Retorna null se não tiver foto pública / privacidade barrar.
 */
export async function getAvatar(
  phone: string
): Promise<{ base64: string; id: string | null } | null> {
  if (!BASE || !TOKEN) return null;
  try {
    const res = await fetch(`${BASE}/user/contact/info`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ phone }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => ({}));
    const av = json?.data?.avatar;
    const b64 = av?.base64 ? String(av.base64) : "";
    if (!b64.startsWith("data:")) return null;
    return { base64: b64, id: av.id ? String(av.id) : null };
  } catch {
    return null;
  }
}

/**
 * Presença GLOBAL da instância. "available" é obrigatório pra receber os
 * eventos de "digitando..." dos contatos — e se perde a cada reconexão,
 * então o cron reafirma a cada tique. Best-effort, nunca lança.
 */
export async function setGlobalPresence(
  state: "available" | "unavailable",
  authToken?: string
): Promise<void> {
  if (!BASE || !TOKEN) return;
  try {
    await fetch(`${BASE}/user/presence`, {
      method: "POST",
      headers: headers(authToken),
      body: JSON.stringify({ type: state }),
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    // silencioso
  }
}

/** Apaga a mensagem PRA TODOS (revoke — some no celular do contato). */
export async function revokeMessage(
  phone: string,
  msgId: string,
  authToken?: string
): Promise<{ ok: boolean; error?: string }> {
  if (!BASE || !TOKEN) return { ok: false, error: "WhatsApp não configurado." };
  const resolved = await resolvePhone(onlyDigits(phone), authToken);
  if (!resolved) return { ok: false, error: "Número não está no WhatsApp." };
  try {
    const res = await fetch(`${BASE}/chat/delete`, {
      method: "POST",
      headers: headers(authToken),
      body: JSON.stringify({ Phone: resolved, Id: msgId }),
      signal: AbortSignal.timeout(15000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.success === false) {
      return { ok: false, error: json?.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Edita uma mensagem já enviada (janela de ~15 min do WhatsApp). */
export async function editTextMessage(
  phone: string,
  msgId: string,
  newBody: string,
  authToken?: string
): Promise<{ ok: boolean; error?: string }> {
  if (!BASE || !TOKEN) return { ok: false, error: "WhatsApp não configurado." };
  const resolved = await resolvePhone(onlyDigits(phone), authToken);
  if (!resolved) return { ok: false, error: "Número não está no WhatsApp." };
  try {
    const res = await fetch(`${BASE}/chat/send/edit`, {
      method: "POST",
      headers: headers(authToken),
      body: JSON.stringify({ Phone: resolved, Id: msgId, Body: newBody }),
      signal: AbortSignal.timeout(15000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.success === false) {
      return { ok: false, error: json?.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * "Digitando..." pro contato (presença na conversa). Best-effort: usa os
 * dígitos direto (sem resolver 9º dígito) pra ser instantâneo; falha é
 * silenciosa — presença nunca pode atrapalhar o envio de verdade.
 */
export async function sendChatPresence(
  phone: string,
  state: "composing" | "paused",
  authToken?: string
): Promise<void> {
  if (!BASE || !TOKEN) return;
  try {
    await fetch(`${BASE}/chat/presence`, {
      method: "POST",
      headers: headers(authToken),
      body: JSON.stringify({ Phone: onlyDigits(phone), State: state, Media: "" }),
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    // silencioso
  }
}

/**
 * Confirma a leitura NO WHATSAPP (recibo de leitura). Como somos um aparelho
 * conectado, isso limpa o "não lido" também no celular do usuário e manda o
 * tick azul pro contato — igual a abrir a conversa no aparelho.
 */
export async function markChatRead(
  chatPhone: string,
  ids: string[],
  authToken?: string
) {
  if (!BASE || !TOKEN || ids.length === 0) return { ok: false };
  try {
    const digits = onlyDigits(chatPhone);
    const res = await fetch(`${BASE}/chat/markread`, {
      method: "POST",
      headers: headers(authToken),
      body: JSON.stringify({ Id: ids, Chat: digits, Sender: digits }),
      signal: AbortSignal.timeout(8000),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

export type ContactBook = Record<
  string,
  {
    PushName?: string;
    FullName?: string;
    BusinessName?: string;
    FirstName?: string;
  }
>;

/**
 * Agenda crua da instância, indexada por JID. Vem em DUAS formas: telefone
 * (@s.whatsapp.net) e id de privacidade (@lid) — o mesmo contato pode
 * aparecer nas duas, ligado pelo PushName.
 */
export async function getContactsRaw(
  authToken?: string
): Promise<ContactBook | null> {
  if (!BASE || (!TOKEN && !authToken)) return null;
  try {
    const res = await fetch(`${BASE}/user/contacts`, {
      headers: headers(authToken),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => ({}));
    return (json?.data ?? {}) as ContactBook;
  } catch {
    return null;
  }
}

/**
 * Agenda da instância: mapa dígitos-do-número → melhor nome conhecido
 * (PushName > FullName > BusinessName > FirstName). Usado pra corrigir
 * leads que ficaram salvos com o número no lugar do nome.
 * Só entradas de telefone — os dígitos de um @lid não são um número real
 * e poluiriam o casamento por sufixo.
 */
export async function getContacts(): Promise<Map<string, string> | null> {
  const data = await getContactsRaw();
  if (!data) return null;
  const map = new Map<string, string>();
  for (const [jid, c] of Object.entries(data)) {
    if (!jid.endsWith("@s.whatsapp.net")) continue;
    const name = String(
      c?.PushName || c?.FullName || c?.BusinessName || c?.FirstName || ""
    ).trim();
    if (!name) continue;
    const digits = onlyDigits(jid.split("@")[0].split(":")[0]);
    if (digits) map.set(digits, name);
  }
  return map;
}

export async function getStatus(authToken?: string) {
  if (!BASE || !TOKEN) return { ok: false, error: "WhatsApp não configurado." };
  try {
    // Timeout curto: não pode travar o render da página se a instância estiver fria/lenta.
    const res = await fetch(`${BASE}/session/status`, {
      headers: headers(authToken),
      signal: AbortSignal.timeout(2500),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, data: json?.data ?? json };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Inicia a conexão WebSocket com o WhatsApp (assina eventos). */
export async function connectSession(authToken?: string) {
  if (!BASE || !TOKEN) return { ok: false, error: "WhatsApp não configurado." };
  try {
    const res = await fetch(`${BASE}/session/connect`, {
      method: "POST",
      headers: headers(authToken),
      body: JSON.stringify({
        // ChatPresence = "digitando..." do contato; sem assinar, o evento não chega
        Subscribe: ["Message", "ReadReceipt", "ChatPresence", "Connected"],
        Immediate: true,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok && json?.success === false) {
      return { ok: false, error: json?.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Retorna o QR code (data URI PNG) pra escanear no WhatsApp do celular. */
export async function getQR(
  authToken?: string
): Promise<{ ok: true; qr: string | null } | { ok: false; error: string }> {
  if (!BASE || !TOKEN) return { ok: false, error: "WhatsApp não configurado." };
  try {
    const res = await fetch(`${BASE}/session/qr`, {
      headers: headers(authToken),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json?.error || `HTTP ${res.status}` };
    const d = json?.data ?? json ?? {};
    const raw =
      d.QRCode ?? d.qrcode ?? d.qr ?? d.QR ?? d.code ?? (typeof d === "string" ? d : null);
    if (!raw) return { ok: true, qr: null };
    // garante data URI de imagem
    const qr =
      typeof raw === "string" && raw.startsWith("data:")
        ? raw
        : `data:image/png;base64,${raw}`;
    return { ok: true, qr };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Desconecta o WebSocket sem deslogar o dispositivo (sessão segue autenticada). */
export async function disconnectSession(authToken?: string) {
  if (!BASE || !TOKEN) return { ok: false, error: "WhatsApp não configurado." };
  try {
    const res = await fetch(`${BASE}/session/disconnect`, {
      method: "POST",
      headers: headers(authToken),
    });
    return { ok: res.ok };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Desvincula o WhatsApp por completo (exige reescanear o QR depois). */
export async function logoutSession(authToken?: string) {
  if (!BASE || !TOKEN) return { ok: false, error: "WhatsApp não configurado." };
  try {
    const res = await fetch(`${BASE}/session/logout`, {
      method: "POST",
      headers: headers(authToken),
    });
    return { ok: res.ok };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Lê o webhook configurado na instância (pra detectar se foi trocado). */
export async function getWebhookConfig(
  authToken?: string
): Promise<{ url: string; events: string[] } | null> {
  if (!BASE || !TOKEN) return null;
  try {
    const res = await fetch(`${BASE}/webhook`, {
      headers: headers(authToken),
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json().catch(() => ({}));
    const d = json?.data ?? json ?? {};
    const events = Array.isArray(d.subscribe)
      ? d.subscribe.map((e: unknown) => String(e))
      : [];
    return { url: String(d.webhook ?? ""), events };
  } catch {
    return null;
  }
}

export async function setWebhook(webhookUrl: string, authToken?: string) {
  if (!BASE || !TOKEN) return { ok: false, error: "WhatsApp não configurado." };
  try {
    const res = await fetch(`${BASE}/webhook`, {
      method: "POST",
      headers: headers(authToken),
      body: JSON.stringify({
        webhookurl: webhookUrl,
        events: ["Message", "ReadReceipt", "Connected", "ChatPresence"],
      }),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, data: json };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ===================== API ADMIN (multi-número) =====================
// Cria/lista instâncias no wuzapi. O token admin NUNCA sai do servidor.
// Fonte: Configurações → Integrações (banco) primeiro; .env de reserva.

async function getAdminToken(): Promise<string | undefined> {
  try {
    const { getIntegrationSecret } = await import("@/lib/integrations");
    const db = await getIntegrationSecret("dinastiapi");
    return db.adminToken?.trim() || ADMIN_TOKEN || undefined;
  } catch {
    return ADMIN_TOKEN || undefined;
  }
}

function adminHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: token,
  };
}

export type AdminInstance = {
  id: string;
  name: string;
  token: string;
  jid: string | null;
  connected: boolean;
  loggedIn: boolean;
};

export async function adminListInstances(): Promise<AdminInstance[] | null> {
  const admTok = await getAdminToken();
  if (!BASE || !admTok) return null;
  try {
    const res = await fetch(`${BASE}/admin/users`, {
      headers: adminHeaders(admTok),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => ({}));
    const list = (json?.data ?? []) as Record<string, unknown>[];
    return list.map((u) => ({
      id: String(u.id ?? ""),
      name: String(u.name ?? ""),
      token: String(u.token ?? ""),
      jid: u.jid ? String(u.jid) : null,
      connected: !!u.connected,
      loggedIn: !!u.loggedIn,
    }));
  } catch {
    return null;
  }
}

/**
 * Cria uma instância nova já apontando pro nosso webhook. O token da
 * instância é gerado aqui (aleatório) e fica guardado só no banco.
 */
export async function adminCreateInstance(
  name: string,
  webhookUrl: string
): Promise<{ ok: true; token: string; id: string } | { ok: false; error: string }> {
  const admTok = await getAdminToken();
  if (!BASE || !admTok)
    return { ok: false, error: "Token admin não configurado." };
  const token = crypto.randomUUID().replace(/-/g, "");
  try {
    const res = await fetch(`${BASE}/admin/users`, {
      method: "POST",
      headers: adminHeaders(admTok),
      body: JSON.stringify({
        name,
        token,
        webhook: webhookUrl,
        events: "Message,ReadReceipt,Connected,Disconnected,PairSuccess,ConnectFailure,LoggedOut,QR,ChatPresence",
      }),
      signal: AbortSignal.timeout(15000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.success === false) {
      return { ok: false, error: json?.error || `HTTP ${res.status}` };
    }
    const id = String(json?.data?.id ?? json?.id ?? "");
    return { ok: true, token, id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
