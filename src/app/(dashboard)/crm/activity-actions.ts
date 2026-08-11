"use server";

import { revalidatePath } from "next/cache";
import {
  pushMeetingToGoogle,
  removeMeetingFromGoogle,
  withLeadName,
} from "@/lib/meeting-sync";
import { db } from "./_helpers";

export async function createMeeting(input: {
  leadId: string;
  title: string;
  startsAt: string; // ISO
  endsAt?: string | null;
  location?: string | null;
}) {
  if (!input.title.trim() || !input.startsAt)
    return { error: "Título e data/hora são obrigatórios." };
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ends =
    input.endsAt ||
    new Date(new Date(input.startsAt).getTime() + 60 * 60 * 1000).toISOString();

  // Agendou pelo chat: o nome do contato entra no fim do título, pra reunião
  // ser reconhecível na Agenda e no Google, longe da conversa. Ex.: "Call - Marx Solar".
  const { data: lead } = await supabase
    .from("leads")
    .select("name")
    .eq("id", input.leadId)
    .maybeSingle();
  const title = withLeadName(input.title, lead?.name);

  const { data: meeting, error } = await supabase
    .from("meetings")
    .insert({
      lead_id: input.leadId,
      title,
      starts_at: input.startsAt,
      ends_at: ends,
      location: input.location || null,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const syncError = user
    ? await pushMeetingToGoogle(supabase, user.id, meeting.id, {
        title,
        startsAt: input.startsAt,
        endsAt: ends,
      })
    : null;

  revalidatePath("/crm/mensagens");
  revalidatePath("/agenda");
  revalidatePath("/crm/leads/[id]", "page");
  return { ok: true, syncError };
}

export async function deleteMeeting(meetingId: string) {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: meeting } = await supabase
    .from("meetings")
    .select("google_event_ids")
    .eq("id", meetingId)
    .maybeSingle();

  if (user) {
    await removeMeetingFromGoogle(
      supabase,
      user.id,
      (meeting?.google_event_ids as { personal?: string } | null)?.personal
    );
  }

  const { error } = await supabase.from("meetings").delete().eq("id", meetingId);
  if (error) return { error: error.message };
  revalidatePath("/crm/mensagens");
  revalidatePath("/agenda");
  return { ok: true };
}

export async function createTask(input: {
  leadId?: string | null;
  title: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  category?: string | null;
  priority?: string | null;
}) {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("lead_tasks").insert({
    lead_id: input.leadId || null,
    title: input.title,
    assignee_id: input.assigneeId || null,
    due_date: input.dueDate || null,
    category: input.category || null,
    priority: input.priority || "normal",
    status: "a_fazer",
    created_by: user?.id ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/crm");
  revalidatePath("/atividades");
  if (input.leadId) revalidatePath("/crm/leads/[id]", "page");
  return { ok: true };
}

export async function toggleTask(
  taskId: string,
  leadId: string | null,
  done: boolean
) {
  const supabase = await db();
  const { error } = await supabase
    .from("lead_tasks")
    .update({
      done,
      status: done ? "concluida" : "a_fazer",
      completed_at: done ? new Date().toISOString() : null,
    })
    .eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath("/crm");
  revalidatePath("/atividades");
  if (leadId) revalidatePath("/crm/leads/[id]", "page");
  return { ok: true };
}

/** Edita a tarefa (status do quadro, prioridade, prazo, título, responsável). */
export async function updateTask(
  taskId: string,
  patch: Partial<{
    title: string;
    due_date: string | null;
    assignee_id: string | null;
    category: string | null;
    status: "a_fazer" | "em_andamento" | "concluida";
    priority: "urgente" | "alta" | "normal" | "baixa";
  }>
) {
  const supabase = await db();
  const finalPatch: Record<string, unknown> = { ...patch };
  // status e done andam juntos (compatibilidade com o resto do app)
  if (patch.status) {
    finalPatch.done = patch.status === "concluida";
    finalPatch.completed_at =
      patch.status === "concluida" ? new Date().toISOString() : null;
  }
  const { error } = await supabase
    .from("lead_tasks")
    .update(finalPatch)
    .eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath("/atividades");
  revalidatePath("/crm");
  return { ok: true };
}

export async function deleteTask(taskId: string, leadId: string | null) {
  const supabase = await db();
  const { error } = await supabase
    .from("lead_tasks")
    .delete()
    .eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath("/crm");
  revalidatePath("/atividades");
  if (leadId) revalidatePath("/crm/leads/[id]", "page");
  return { ok: true };
}
