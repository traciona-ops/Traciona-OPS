import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(
      4,
      9
    )}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    // BR sem o 9º dígito (fixo ou celular antigo): +55 (DD) XXXX-XXXX
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(
      4,
      8
    )}-${digits.slice(8)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

export function currencyBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export type StageLevel = "neutral" | "ok" | "warn" | "late";

export function stageTimeInfo(
  stageChangedAt: string,
  slaDays: number | null,
  isClosed: boolean
): { label: string; level: StageLevel; days: number } {
  const start = new Date(stageChangedAt).getTime();
  const ms = Math.max(0, Date.now() - start);
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;

  let label: string;
  if (days > 0) label = `${days}d ${hours}h`;
  else if (hours > 0) label = `${hours}h ${mins}m`;
  else label = `${mins}m`;

  if (isClosed || slaDays == null) {
    return { label, level: "neutral", days };
  }

  const elapsedDays = ms / 86400000;
  let level: StageLevel = "ok";
  if (elapsedDays >= slaDays) level = "late";
  else if (elapsedDays >= slaDays * 0.6) level = "warn";

  return { label, level, days };
}

export const STAGE_LEVEL_STYLE: Record<
  StageLevel,
  { bg: string; color: string }
> = {
  neutral: { bg: "var(--color-surface-2)", color: "var(--color-muted)" },
  // O fundo é o próprio token diluído na superfície: acompanha o tema em vez
  // de congelar o rgba do acento antigo.
  ok: {
    bg: "color-mix(in srgb, var(--color-success) 12%, var(--color-surface))",
    color: "var(--color-success)",
  },
  warn: {
    bg: "color-mix(in srgb, var(--color-warning) 14%, var(--color-surface))",
    color: "var(--color-warning)",
  },
  late: {
    bg: "color-mix(in srgb, var(--color-danger) 14%, var(--color-surface))",
    color: "var(--color-danger)",
  },
};

function relLuminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => {
    const s = parseInt(hex.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/**
 * Tinta legível sobre uma cor escolhida pelo usuário (cor de etapa, de funil,
 * de tag). Decide pelo contraste WCAG real: branco fixo falha feio em amarelo,
 * ciano e menta, onde a razão cai pra ~1.7:1.
 */
export function readableInk(bgHex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(bgHex)) return "#ffffff";
  const bg = relLuminance(bgHex);
  const ratio = (a: number, b: number) => {
    const [hi, lo] = [a, b].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  return ratio(relLuminance("#0f1c2e"), bg) >= ratio(relLuminance("#ffffff"), bg)
    ? "#0f1c2e"
    : "#ffffff";
}
