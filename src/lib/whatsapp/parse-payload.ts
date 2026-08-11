type AnyObj = Record<string, any>;

export function tryParseJson(s: string): AnyObj | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Extrai payload JSON (JSON puro ou form-encoded com jsonData). */
export function parseWebhookBody(contentType: string, raw: string): AnyObj {
  if (contentType.includes("application/json")) {
    return tryParseJson(raw) ?? {};
  }
  const params = new URLSearchParams(raw);
  const jd = params.get("jsonData") || params.get("data") || params.get("body");
  return (jd && tryParseJson(jd)) || tryParseJson(raw) || {};
}

export function unwrapWebhookEvent(payload: AnyObj): {
  event: AnyObj;
  info: AnyObj;
  msg: AnyObj;
  evType: string;
  typeField: string;
} {
  const event: AnyObj =
    payload?.data?.event ?? payload?.event ?? payload ?? {};
  return {
    event,
    info: event?.Info ?? {},
    msg: event?.Message ?? {},
    evType: String(payload?.data?.type ?? payload?.type ?? "").toLowerCase(),
    typeField: String(
      payload?.data?.type ?? (payload as AnyObj)?.eventType ?? payload?.type ?? ""
    ),
  };
}
