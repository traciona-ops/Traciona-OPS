"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  pushMeetingToGoogle,
  removeMeetingFromGoogle,
  withLeadName,
} from "@/lib/meeting-sync";

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

  // Com cliente escolhido, o nome entra no fim do título ("Call - Marx Solar"),
  // pra reunião ser reconhecível na Agenda e no Google.
  let title = data.title.trim();
  if (data.lead_id) {
    const { data: lead } = await supabase
      .from("leads")
      .select("name")
      .eq("id", data.lead_id)
      .maybeSingle();
    title = withLeadName(title, lead?.name);
  }

  // Create meeting in DB
  const { data: meeting, error } = await supabase
    .from("meetings")
    .insert({
      title,
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

  const syncError = await pushMeetingToGoogle(supabase, user.id, meeting.id, {
    title,
    description: data.description,
    startsAt: startDate,
    endsAt: endDate,
  });

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
      const { updateCalendarEvent } = await import("@/lib/services/google-calendar");

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

  await removeMeetingFromGoogle(
    supabase,
    user.id,
    meeting.google_event_ids?.personal
  );

  // Delete from DB
  const { error } = await supabase.from("meetings").delete().eq("id", id);

  if (error) throw error;
  revalidatePath("/agenda");
  return { success: true };
}
