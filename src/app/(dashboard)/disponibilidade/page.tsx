import { CalendarClock } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { getProfile } from "@/lib/auth";
import { requireModule } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { AvailabilityFilters } from "@/components/disponibilidade/availability-filters";
import { TZ, ymdBR } from "@/lib/utils/dates";
import type { Meeting, Profile } from "@/lib/types";

export const metadata = { title: "Disponibilidade" };

// América/São_Paulo é UTC-3 o ano todo (sem horário de verão desde 2019).
const BR_OFFSET = "-03:00";

type DayResult = {
  label: string;
  slots: { start: string; end: string }[];
  meetings: number;
};

function clampInt(v: string | undefined, def: number, min: number, max: number) {
  const n = parseInt(v ?? "", 10);
  if (Number.isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
}

const validTime = (t: string | undefined, def: string) =>
  t && /^\d{2}:\d{2}$/.test(t) ? t : def;

export default async function DisponibilidadePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireModule("disponibilidade");
  const sp = await searchParams;
  const profile = await getProfile();
  const supabase = await createClient();

  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.d ?? "") ? sp.d! : ymdBR();
  const duration = clampInt(sp.dur, 60, 15, 480);
  const days = clampInt(sp.days, 1, 1, 28);
  const hourMin = validTime(sp.h1, "08:00");
  const hourMax = validTime(sp.h2, "18:00");

  const { data: teamData } = await supabase
    .from("profiles")
    .select("*")
    .eq("active", true)
    .order("name");
  const team = (teamData ?? []) as Profile[];
  const userId =
    team.find((m) => m.id === sp.u)?.id ??
    team.find((m) => m.id === profile.id)?.id ??
    team[0]?.id ??
    profile.id;
  const userName = team.find((m) => m.id === userId)?.name ?? "";

  // Reuniões do usuário no intervalo consultado
  const rangeStart = new Date(`${date}T00:00:00${BR_OFFSET}`);
  const rangeEnd = new Date(rangeStart.getTime() + days * 86400_000);
  const { data: meetingsData } = await supabase
    .from("meetings")
    .select("starts_at, ends_at, created_by")
    .eq("created_by", userId)
    .gte("starts_at", rangeStart.toISOString())
    .lt("starts_at", rangeEnd.toISOString());
  const meetings = (meetingsData ?? []) as Pick<
    Meeting,
    "starts_at" | "ends_at" | "created_by"
  >[];

  // Ocupações em ms (reunião sem fim = 1h)
  const busyAll = meetings
    .map((m) => {
      const s = new Date(m.starts_at).getTime();
      const e = m.ends_at ? new Date(m.ends_at).getTime() : s + 3600_000;
      return { s, e };
    })
    .sort((a, b) => a.s - b.s);

  const now = Date.now();
  const stepMs = Math.min(30, duration) * 60_000;
  const durMs = duration * 60_000;
  const fmtTime = (ms: number) =>
    new Date(ms).toLocaleTimeString("pt-BR", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
    });

  const results: DayResult[] = [];
  for (let i = 0; i < days; i++) {
    const dayStart = new Date(rangeStart.getTime() + i * 86400_000);
    const dayStr = dayStart.toLocaleDateString("en-CA", { timeZone: TZ });
    const winStart = new Date(`${dayStr}T${hourMin}:00${BR_OFFSET}`).getTime();
    const winEnd = new Date(`${dayStr}T${hourMax}:00${BR_OFFSET}`).getTime();
    if (winEnd <= winStart) continue;

    const busy = busyAll.filter((b) => b.e > winStart && b.s < winEnd);
    const slots: { start: string; end: string }[] = [];
    for (let t = winStart; t + durMs <= winEnd; t += stepMs) {
      if (t + durMs <= now) continue; // não oferece horário no passado
      const conflict = busy.some((b) => t < b.e && t + durMs > b.s);
      if (!conflict) slots.push({ start: fmtTime(t), end: fmtTime(t + durMs) });
    }

    results.push({
      label: dayStart.toLocaleDateString("pt-BR", {
        timeZone: TZ,
        weekday: "long",
        day: "2-digit",
        month: "long",
      }),
      slots,
      meetings: busy.length,
    });
  }

  return (
    <>
      <Topbar
        title="Disponibilidade"
        subtitle="Horários livres considerando a agenda e o horário comercial"
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-5 lg:flex-row">
          <AvailabilityFilters
            team={team}
            initial={{ userId, date, duration, days, hourMin, hourMax }}
          />

          <div className="min-w-0 flex-1 space-y-4">
            <p className="text-sm text-[var(--color-muted)]">
              Horários livres de{" "}
              <span className="font-semibold text-[var(--color-foreground)]">
                {userName}
              </span>{" "}
              — blocos de {duration} min entre {hourMin} e {hourMax}.
            </p>

            {results.map((day) => (
              <div key={day.label} className="card p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold capitalize">{day.label}</p>
                  {day.meetings > 0 && (
                    <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] text-[var(--color-muted)]">
                      {day.meetings} reuni{day.meetings === 1 ? "ão" : "ões"} no
                      dia
                    </span>
                  )}
                </div>
                {day.slots.length === 0 ? (
                  <p className="text-sm text-[var(--color-muted-2)]">
                    Sem horários livres nesse dia.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {day.slots.map((s) => (
                      <span
                        key={s.start}
                        className="rounded-lg border border-[var(--color-border-strong)] px-2.5 py-1.5 text-xs font-medium tabular-nums text-[var(--color-foreground)]"
                      >
                        {s.start} – {s.end}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {results.length === 0 && (
              <div className="card flex flex-col items-center p-10 text-center">
                <CalendarClock className="mb-3 h-8 w-8 text-[var(--color-muted-2)]" />
                <p className="text-sm text-[var(--color-muted)]">
                  Ajuste os filtros e clique em Filtrar pra consultar os
                  horários.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
