/**
 * Segundos entre dois instantes em horário útil.
 * business_hours: { tz, days: { "0".."6": [["09:00","18:00"]] }, holidays }
 * Chave de dia = getDay() (0=dom). Sem days → wall-clock.
 */
export type BusinessHours = {
  tz?: string;
  days?: Record<string, [string, string][]>;
  holidays?: string[];
};

function parseHm(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function zonedParts(d: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wdMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: wdMap[get("weekday")] ?? 0,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** Conta segundos de expediente entre `from` e `to`. */
export function businessSeconds(
  fromIso: string | Date,
  toIso: string | Date,
  hours?: BusinessHours | null
): number {
  const from = typeof fromIso === "string" ? new Date(fromIso) : fromIso;
  const to = typeof toIso === "string" ? new Date(toIso) : toIso;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    return 0;
  }

  if (!hours?.days || Object.keys(hours.days).length === 0) {
    return Math.floor((to.getTime() - from.getTime()) / 1000);
  }

  const tz = hours.tz || "America/Sao_Paulo";
  const holidays = new Set(hours.holidays ?? []);
  let totalMin = 0;

  // Percorre em passos de 30 min — simples e suficiente pra SLA de chat
  const stepMs = 30 * 60 * 1000;
  for (let t = from.getTime(); t < to.getTime(); t += stepMs) {
    const sliceEnd = Math.min(t + stepMs, to.getTime());
    const mid = new Date((t + sliceEnd) / 2);
    const { ymd, weekday, minutes } = zonedParts(mid, tz);
    if (holidays.has(ymd)) continue;
    const windows = hours.days[String(weekday)] ?? [];
    const inWindow = windows.some(([a, b]) => {
      const start = parseHm(a);
      const end = parseHm(b);
      return minutes >= start && minutes < end;
    });
    if (inWindow) totalMin += (sliceEnd - t) / 60_000;
  }

  return Math.floor(totalMin * 60);
}
