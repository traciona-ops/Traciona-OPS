// Datas SEMPRE no fuso do Brasil. A Vercel roda em UTC — usar Date.getHours()/
// toISOString().slice(0,10) direto no servidor desloca tudo em +3h (reunião de
// 22h "pula" pro dia seguinte, tarefa de hoje vira "atrasada" às 21h etc).

export const TZ = "America/Sao_Paulo";

/** "2026-07-14" no fuso BR (en-CA formata como YYYY-MM-DD). */
export function ymdBR(d: Date | string = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof d === "string" ? new Date(d) : d);
}

/** Hora (0-23) atual — ou de uma data — no fuso BR. */
export function hourBR(d: Date | string = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hour: "numeric",
      hour12: false,
    }).format(typeof d === "string" ? new Date(d) : d)
  );
}

/** "14:32" no fuso BR. */
export function fmtTimeBR(d: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(typeof d === "string" ? new Date(d) : d);
}

/** "14/07/2026" no fuso BR. */
export function fmtDateBR(d: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(typeof d === "string" ? new Date(d) : d);
}

/** "terça-feira, 14 de julho" no fuso BR. */
export function fmtDayLongBR(d: Date | string = new Date()): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(typeof d === "string" ? new Date(d) : d);
}

/** Início do mês corrente (e do anterior) como instantes UTC corretos pro fuso BR. */
export function monthBoundsBR(now: Date = new Date()): {
  monthStart: Date;
  lastMonthStart: Date;
} {
  const [y, m] = ymdBR(now).split("-").map(Number);
  // meia-noite BR = 03:00 UTC (BRT, sem DST desde 2019)
  const monthStart = new Date(Date.UTC(y, m - 1, 1, 3));
  const lastMonthStart = new Date(Date.UTC(y, m - 2, 1, 3));
  return { monthStart, lastMonthStart };
}

/**
 * Rótulo relativo de dia no fuso BR: "Hoje" | "Ontem" | "sexta-feira" (<7 dias)
 * | "14/07/2026". Usado em separadores de chat e lista de conversas.
 */
export function relativeDayBR(d: Date | string, now: Date = new Date()): string {
  const target = typeof d === "string" ? new Date(d) : d;
  const today = ymdBR(now);
  const day = ymdBR(target);
  if (day === today) return "Hoje";
  const diffDays = Math.round(
    (Date.parse(today) - Date.parse(day)) / 86_400_000
  );
  if (diffDays === 1) return "Ontem";
  if (diffDays > 1 && diffDays < 7) {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long" }).format(
      target
    );
  }
  return fmtDateBR(target);
}
