import { createCalendarEvent, deleteCalendarEvent } from "@/lib/services/google-calendar";

// Espelho das reuniões no Google Calendar. Vive aqui porque duas telas criam
// reunião — a Agenda e o painel do lead no OPS Chat — e as duas precisam do
// mesmo comportamento. Falhar aqui nunca desfaz a reunião do Traciona: o erro
// volta como string pra quem chamou decidir como mostrar.

/** Client do Supabase já autenticado (server ou admin). */
type Db = {
  from: (table: string) => any;
};

/**
 * Título da reunião com o nome do contato no fim: "Call - Marx Solar".
 * Não repete o nome se quem escreveu já tiver colocado.
 */
export function withLeadName(title: string, leadName?: string | null) {
  const base = title.trim();
  const name = leadName?.trim();
  if (!name) return base;
  if (base.toLowerCase().includes(name.toLowerCase())) return base;
  return `${base} - ${name}`;
}

async function getIntegration(supabase: Db, userId: string) {
  const { data } = await supabase
    .from("calendar_integrations")
    .select("google_refresh_token, google_calendar_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.google_refresh_token || !data.google_calendar_id) return null;
  return data as { google_refresh_token: string; google_calendar_id: string };
}

/**
 * Cria o evento no Google e guarda o ID em `meetings.google_event_ids.personal`.
 * Devolve a mensagem de erro, ou null se deu certo / não há integração.
 */
export async function pushMeetingToGoogle(
  supabase: Db,
  userId: string,
  meetingId: string,
  event: {
    title: string;
    description?: string | null;
    startsAt: string | Date;
    endsAt: string | Date;
  }
): Promise<string | null> {
  try {
    const integration = await getIntegration(supabase, userId);
    if (!integration) return null; // sem Google conectado: silencioso, é opcional

    const startTime = new Date(event.startsAt);
    const endTime = new Date(event.endsAt);
    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      return "Data da reunião inválida.";
    }

    const googleEvent = await createCalendarEvent(
      integration.google_refresh_token,
      integration.google_calendar_id,
      {
        summary: event.title,
        description: event.description ?? undefined,
        startTime,
        endTime,
        generateMeetLink: true,
      }
    );

    if (!googleEvent.id) return "Google não devolveu o ID do evento.";

    await supabase
      .from("meetings")
      .update({
        google_event_ids: { personal: googleEvent.id },
        synced_to_google_at: new Date().toISOString(),
      })
      .eq("id", meetingId);

    return null;
  } catch (err) {
    console.error("pushMeetingToGoogle:", err);
    return err instanceof Error ? err.message : "Erro no Google Calendar.";
  }
}

/** Apaga o evento espelhado. Não lança: sumir do Traciona é o que importa. */
export async function removeMeetingFromGoogle(
  supabase: Db,
  userId: string,
  googleEventId: string | null | undefined
): Promise<void> {
  if (!googleEventId) return;
  try {
    const integration = await getIntegration(supabase, userId);
    if (!integration) return;
    await deleteCalendarEvent(
      integration.google_refresh_token,
      integration.google_calendar_id,
      googleEventId
    );
  } catch (err) {
    console.error("removeMeetingFromGoogle:", err);
  }
}
