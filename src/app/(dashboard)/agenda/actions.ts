"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createCalendarEvent } from "@/lib/google-calendar";

export async function createMeeting(data: {
  title: string;
  description?: string;
  starts_at: string;
  ends_at?: string;
  lead_id?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const startDate = new Date(data.starts_at);
  // Sem fim informado, a reunião dura 1 hora — Date inválido quebraria o sync.
  const endDate = data.ends_at
    ? new Date(data.ends_at)
    : new Date(startDate.getTime() + 60 * 60 * 1000);

  // Create meeting in DB
  const { data: meeting, error } = await supabase
    .from("meetings")
    .insert({
      title: data.title,
      description: data.description,
      starts_at: startDate.toISOString(),
      ends_at: endDate.toISOString(),
      lead_id: data.lead_id || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw error;
  if (!meeting) throw new Error("Failed to create meeting");

  // Sincroniza no Google. Falhar aqui não desfaz a reunião, mas o erro volta pra UI.
  let syncError: string | null = null;
  try {
    const { data: integration } = await supabase
      .from("calendar_integrations")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!integration?.google_refresh_token || !integration.google_calendar_id) {
      syncError = "Google Calendar não está conectado.";
    } else {
      const googleEvent = await createCalendarEvent(
        integration.google_refresh_token,
        integration.google_calendar_id,
        {
          summary: data.title,
          description: data.description,
          startTime: startDate,
          endTime: endDate,
          generateMeetLink: true,
        }
      );

      if (googleEvent.id) {
        await supabase
          .from("meetings")
          .update({
            google_event_ids: { personal: googleEvent.id },
            synced_to_google_at: new Date().toISOString(),
          })
          .eq("id", meeting.id);
      } else {
        syncError = "Google não devolveu o ID do evento.";
      }
    }
  } catch (err) {
    console.error("Failed to sync to Google Calendar:", err);
    syncError = err instanceof Error ? err.message : "Erro desconhecido no Google Calendar.";
  }

  revalidatePath("/agenda");
  return { ...meeting, syncError };
}

export async function updateMeeting(
  id: string,
  data: {
    title?: string;
    description?: string;
    location?: string;
    starts_at?: string;
    ends_at?: string;
    meet_url?: string;
    lead_id?: string;
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  // Update in DB
  const { data: meeting, error } = await supabase
    .from("meetings")
    .update(data)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  if (!meeting) throw new Error("Meeting not found");

  // Sync to Google Calendar
  try {
    const { data: integration } = await supabase
      .from("calendar_integrations")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (
      integration?.google_refresh_token &&
      meeting.google_event_ids?.personal
    ) {
      const { updateCalendarEvent } = await import("@/lib/google-calendar");

      const updates: Record<string, any> = {};
      if (data.title) updates.summary = data.title;
      if (data.description) updates.description = data.description;
      if (data.location) updates.location = data.location;
      if (data.starts_at) updates.startTime = new Date(data.starts_at);
      if (data.ends_at) updates.endTime = new Date(data.ends_at);

      await updateCalendarEvent(
        integration.google_refresh_token,
        integration.google_calendar_id,
        meeting.google_event_ids.personal,
        updates
      );
    }
  } catch (syncError) {
    console.error("Failed to sync update to Google Calendar:", syncError);
  }

  return meeting;
}

export async function deleteMeeting(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const { data: meeting } = await supabase
    .from("meetings")
    .select()
    .eq("id", id)
    .single();

  if (!meeting) throw new Error("Meeting not found");

  // Delete from Google Calendar
  try {
    const { data: integration } = await supabase
      .from("calendar_integrations")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (
      integration?.google_refresh_token &&
      meeting.google_event_ids?.personal
    ) {
      const { deleteCalendarEvent } = await import("@/lib/google-calendar");

      await deleteCalendarEvent(
        integration.google_refresh_token,
        integration.google_calendar_id,
        meeting.google_event_ids.personal
      );
    }
  } catch (syncError) {
    console.error("Failed to delete from Google Calendar:", syncError);
  }

  // Delete from DB
  const { error } = await supabase.from("meetings").delete().eq("id", id);

  if (error) throw error;
  revalidatePath("/agenda");
  return { success: true };
}
