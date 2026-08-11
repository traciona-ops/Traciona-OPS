import { onlyDigits } from "@/lib/services/whatsapp/dinastia";

type AnyObj = Record<string, unknown>;

/** Extrai dígitos do JID @s.whatsapp.net (ignora :device). */
export function phoneFromJidCandidates(
  ...cands: Array<string | null | undefined>
): string {
  for (const c of cands) {
    const s = String(c ?? "");
    if (s.includes("@s.whatsapp.net"))
      return onlyDigits(s.split("@")[0].split(":")[0]);
  }
  return "";
}

export function extractLid(
  ...cands: Array<string | null | undefined>
): string {
  const jid = cands
    .map((v) => String(v ?? ""))
    .find((j) => j.endsWith("@lid"));
  return jid ? jid.split("@")[0].split(":")[0] : "";
}

/** Variações BR do 9º dígito: 55 DDD 9XXXXXXXX <-> 55 DDD XXXXXXXX */
export function brPhoneCandidates(digits: string): string[] {
  const candidates = new Set<string>([digits]);
  if (digits.startsWith("55")) {
    if (digits.length === 13)
      candidates.add(digits.slice(0, 4) + digits.slice(5));
    if (digits.length === 12)
      candidates.add(digits.slice(0, 4) + "9" + digits.slice(4));
  }
  return [...candidates];
}

export function phoneFromMessageInfo(info: AnyObj): string {
  return phoneFromJidCandidates(
    info.Chat as string,
    info.SenderAlt as string,
    info.RecipientAlt as string,
    info.Sender as string
  );
}
