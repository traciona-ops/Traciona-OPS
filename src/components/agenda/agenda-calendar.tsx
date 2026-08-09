"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  Trash2,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils/ui";
import { toast } from "@/components/ui/toast";
import { deleteMeeting } from "@/app/(dashboard)/agenda/actions";

// Agenda repaginada: grade mensal limpa + painel do dia selecionado.
// Tudo no fuso BR (o servidor manda ISO; o cliente formata).

export type CalMeeting = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  lead: { id: string; name: string } | null;
};

const TZ = "America/Sao_Paulo";
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** yyyy-mm-dd do instante NO FUSO BR. */
function ymdBR(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

function timeBR(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AgendaCalendar({
  meetings,
  onDateDoubleClick,
}: {
  meetings: CalMeeting[];
  onDateDoubleClick?: (date: string) => void;
}) {
  const todayYmd = ymdBR(new Date());
  const [cursor, setCursor] = useState(() => {
    const [y, m] = todayYmd.split("-").map(Number);
    return { y, m: m - 1 }; // m: 0-11
  });
  const [selected, setSelected] = useState(todayYmd);

  // eventos agrupados por dia (BR)
  const byDay = useMemo(() => {
    const map = new Map<string, CalMeeting[]>();
    for (const m of meetings) {
      const k = ymdBR(new Date(m.starts_at));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(m);
    }
    for (const list of map.values())
      list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return map;
  }, [meetings]);

  // células do mês (semana começa no domingo)
  const cells = useMemo(() => {
    const first = new Date(Date.UTC(cursor.y, cursor.m, 1));
    const startDow = first.getUTCDay();
    const daysInMonth = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();
    const out: { ymd: string; day: number; inMonth: boolean }[] = [];
    // dias do mês anterior pra completar a primeira semana
    const prevDays = new Date(Date.UTC(cursor.y, cursor.m, 0)).getUTCDate();
    for (let i = startDow - 1; i >= 0; i--) {
      const d = prevDays - i;
      const dt = new Date(Date.UTC(cursor.y, cursor.m - 1, d));
      out.push({ ymd: dt.toISOString().slice(0, 10), day: d, inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(Date.UTC(cursor.y, cursor.m, d));
      out.push({ ymd: dt.toISOString().slice(0, 10), day: d, inMonth: true });
    }
    while (out.length % 7 !== 0) {
      const last = out[out.length - 1];
      const dt = new Date(last.ymd + "T00:00:00Z");
      dt.setUTCDate(dt.getUTCDate() + 1);
      out.push({
        ymd: dt.toISOString().slice(0, 10),
        day: dt.getUTCDate(),
        inMonth: false,
      });
    }
    return out;
  }, [cursor]);

  const monthLabel = new Date(Date.UTC(cursor.y, cursor.m, 15)).toLocaleDateString(
    "pt-BR",
    { month: "long", year: "numeric", timeZone: "UTC" }
  );

  function nav(delta: number) {
    setCursor(({ y, m }) => {
      const nm = m + delta;
      return { y: y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 };
    });
  }

  function goToday() {
    const [y, m] = todayYmd.split("-").map(Number);
    setCursor({ y, m: m - 1 });
    setSelected(todayYmd);
  }

  const dayMeetings = byDay.get(selected) ?? [];
  const upcoming = useMemo(() => {
    const now = Date.now();
    return meetings
      .filter((m) => {
        const end = m.ends_at
          ? new Date(m.ends_at).getTime()
          : new Date(m.starts_at).getTime() + 3600_000;
        return end >= now;
      })
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .slice(0, 6);
  }, [meetings]);

  const selectedLabel = new Date(selected + "T12:00:00").toLocaleDateString(
    "pt-BR",
    { weekday: "long", day: "2-digit", month: "long" }
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      {/* ---- GRADE DO MÊS ---- */}
      <section className="card overflow-hidden p-0">
        <header className="flex items-center gap-2 border-b border-[var(--color-border)] p-3.5">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold capitalize">
            {monthLabel}
          </h2>
          <button
            onClick={goToday}
            className="h-8 rounded-lg px-3 text-xs font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]"
          >
            Hoje
          </button>
          <button
            onClick={() => nav(-1)}
            aria-label="Mês anterior"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => nav(1)}
            aria-label="Próximo mês"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </header>

        <div className="grid grid-cols-7 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/60">
          {WEEKDAYS.map((d) => (
            <span
              key={d}
              className="py-2 text-center text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted-2)]"
            >
              {d}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((c) => {
            const events = byDay.get(c.ymd) ?? [];
            const isToday = c.ymd === todayYmd;
            const isSelected = c.ymd === selected;
            return (
              <button
                key={c.ymd}
                onClick={() => setSelected(c.ymd)}
                onDoubleClick={() => {
                  const [y, m, d] = c.ymd.split("-");
                  const dateTimeLocal = `${y}-${m}-${d}T09:00`;
                  onDateDoubleClick?.(dateTimeLocal);
                }}
                className={cn(
                  "flex min-h-[72px] flex-col items-stretch gap-1 border-b border-r border-[var(--color-border)] p-1.5 text-left transition-colors last:border-r-0 sm:min-h-[84px]",
                  !c.inMonth && "bg-[var(--color-surface-2)]/40",
                  isSelected
                    ? "bg-[var(--color-primary)]/8"
                    : "hover:bg-[var(--color-surface-2)]/70"
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                    isToday
                      ? "bg-[var(--color-primary)] font-semibold text-[var(--color-on-accent)]"
                      : c.inMonth
                      ? "text-[var(--color-foreground)]"
                      : "text-[var(--color-muted-2)]"
                  )}
                >
                  {c.day}
                </span>
                <span className="flex flex-col gap-0.5">
                  {events.slice(0, 2).map((e) => (
                    <span
                      key={e.id}
                      className="truncate rounded bg-[var(--color-primary)]/12 px-1 py-0.5 text-[10px] font-medium leading-tight text-[var(--color-primary)]"
                    >
                      {timeBR(e.starts_at)} {e.title}
                    </span>
                  ))}
                  {events.length > 2 && (
                    <span className="px-1 text-[10px] text-[var(--color-muted-2)]">
                      +{events.length - 2}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---- PAINEL DO DIA + PRÓXIMOS ---- */}
      <div className="space-y-4">
        <section className="card p-4">
          <h3 className="text-sm font-semibold capitalize">{selectedLabel}</h3>
          <div className="mt-3 space-y-2">
            {dayMeetings.map((m) => (
              <MeetingItem key={m.id} m={m} />
            ))}
            {!dayMeetings.length && (
              <p className="text-sm text-[var(--color-muted-2)]">
                Nada agendado nesse dia.
              </p>
            )}
          </div>
        </section>

        <section className="card p-4">
          <h3 className="mb-3 text-sm font-semibold">Próximos compromissos</h3>
          <div className="space-y-2">
            {upcoming.map((m) => (
              <MeetingItem key={m.id} m={m} withDate />
            ))}
            {!upcoming.length && (
              <div className="flex flex-col items-center py-6 text-center">
                <CalendarDays className="mb-2 h-6 w-6 text-[var(--color-muted-2)]" />
                <p className="text-sm text-[var(--color-muted-2)]">
                  Agenda livre. Marque reuniões pela conversa ou pelo perfil do
                  lead.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function MeetingItem({ m, withDate }: { m: CalMeeting; withDate?: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      try {
        await deleteMeeting(m.id);
        toast("Reunião apagada.");
        router.refresh();
      } catch {
        toast("Não consegui apagar a reunião.", { type: "error" });
        setConfirming(false);
      }
    });
  }

  return (
    <div className="group flex items-start gap-2.5 rounded-xl bg-[var(--color-surface-2)]/70 px-3 py-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/12">
        <Clock className="h-4 w-4 text-[var(--color-primary)]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{m.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-[var(--color-muted)]">
          <span>
            {withDate &&
              new Date(m.starts_at).toLocaleDateString("pt-BR", {
                timeZone: TZ,
                day: "2-digit",
                month: "2-digit",
              }) + " · "}
            {timeBR(m.starts_at)}
            {m.ends_at && ` – ${timeBR(m.ends_at)}`}
          </span>
          {m.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {m.location}
            </span>
          )}
        </p>
        {m.lead && (
          <Link
            href={`/crm/leads/${m.lead.id}`}
            className="mt-0.5 inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
          >
            <User className="h-3 w-3" />
            {m.lead.name}
          </Link>
        )}
      </div>

      {confirming ? (
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={remove}
            disabled={pending}
            className="flex h-7 items-center rounded-lg bg-[var(--color-danger)] px-2 text-[11px] font-medium text-[var(--color-on-accent)] transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Apagar"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="flex h-7 items-center rounded-lg px-2 text-[11px] font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]"
          >
            Não
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          aria-label={`Apagar reunião ${m.title}`}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--color-muted-2)] opacity-0 transition hover:bg-[var(--color-surface)] hover:text-[var(--color-danger)] focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
