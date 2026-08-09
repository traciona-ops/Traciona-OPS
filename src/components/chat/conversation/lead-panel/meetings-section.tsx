"use client";

import { useState } from "react";
import { CalendarDays, CalendarPlus, Clock, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { createMeeting, deleteMeeting } from "@/app/(dashboard)/crm/actions";
import { cancelScheduledMessage } from "@/app/(dashboard)/crm/whatsapp-actions";
import { SECTION_LABEL_ICON, type RunMutation } from "@/components/chat/conversation/lead-panel/ui";
import type { Meeting, ScheduledMessage } from "@/lib/types";

const SHORT_DATETIME: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
};

/** Reuniões do lead — criar aqui já espelha no Google Calendar (meeting-sync). */
export function MeetingsSection({
  leadId,
  meetings,
  busy,
  run,
}: {
  leadId: string;
  meetings: Meeting[];
  busy: boolean;
  run: RunMutation;
}) {
  const [meetTitle, setMeetTitle] = useState("");
  const [meetWhen, setMeetWhen] = useState("");

  return (
    <div>
      <label className={SECTION_LABEL_ICON}>
        <CalendarDays className="h-3 w-3" /> Agendamentos
      </label>
      <div className="mb-2 space-y-1.5">
        {meetings.length === 0 && (
          <p className="text-xs text-[var(--color-muted-2)]">
            Nenhuma reunião agendada.
          </p>
        )}
        {meetings.map((mt) => {
          const past = new Date(mt.starts_at).getTime() < Date.now();
          return (
            <div
              key={mt.id}
              className="flex items-center gap-2 rounded-lg bg-[var(--color-surface-2)] px-2.5 py-2"
            >
              <CalendarDays
                className={`h-4 w-4 shrink-0 ${
                  past ? "text-[var(--color-muted-2)]" : "text-[var(--color-primary)]"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{mt.title}</p>
                <p className="text-[11px] text-[var(--color-muted)]">
                  {new Date(mt.starts_at).toLocaleString("pt-BR", SHORT_DATETIME)}
                </p>
              </div>
              <button
                onClick={() => run(() => deleteMeeting(mt.id))}
                className="text-[var(--color-muted-2)] hover:text-[var(--color-danger)]"
                aria-label="Excluir agendamento"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      <div className="space-y-1.5">
        <Input
          value={meetTitle}
          onChange={(e) => setMeetTitle(e.target.value)}
          placeholder="Título da reunião"
          className="h-8 text-xs"
        />
        <div className="flex gap-1.5">
          <Input
            type="datetime-local"
            value={meetWhen}
            onChange={(e) => setMeetWhen(e.target.value)}
            className="h-8 flex-1 text-xs"
          />
          <Button
            size="sm"
            disabled={busy || !meetTitle.trim() || !meetWhen}
            onClick={() => {
              run(async () => {
                const r = await createMeeting({
                  leadId,
                  title: meetTitle.trim(),
                  startsAt: new Date(meetWhen).toISOString(),
                });
                if (r?.error) toast(r.error, { type: "error" });
                else if (r?.syncError)
                  toast(`Reunião criada, mas não foi pro Google: ${r.syncError}`, {
                    type: "error",
                  });
              });
              setMeetTitle("");
              setMeetWhen("");
            }}
          >
            <CalendarPlus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Mensagens que ainda vão sair (o job scheduler dispara). */
export function ScheduledMessagesSection({
  leadId,
  scheduled,
  run,
}: {
  leadId: string;
  scheduled: ScheduledMessage[];
  run: RunMutation;
}) {
  if (scheduled.length === 0) return null;

  return (
    <div>
      <label className={SECTION_LABEL_ICON}>
        <Clock className="h-3 w-3" /> Mensagens agendadas
      </label>
      <div className="space-y-1.5">
        {scheduled.map((sm) => (
          <div
            key={sm.id}
            className="flex items-start gap-2 rounded-lg bg-[var(--color-surface-2)] px-2.5 py-2"
          >
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs">{sm.body}</p>
              <p className="text-[11px] text-[var(--color-muted)]">
                {new Date(sm.send_at).toLocaleString("pt-BR", SHORT_DATETIME)}
              </p>
            </div>
            <button
              onClick={() => run(() => cancelScheduledMessage(sm.id, leadId))}
              className="text-[var(--color-muted-2)] hover:text-[var(--color-danger)]"
              aria-label="Cancelar agendamento"
              title="Cancelar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
