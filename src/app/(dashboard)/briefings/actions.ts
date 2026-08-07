"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
import { sanitizeHtml } from "@/lib/sanitize";

// Actions dos Briefings & Solicitações (equipe logada; RLS auth).
// description_html SEMPRE passa pelo sanitizador antes de tocar o banco.

const KINDS = ["arte", "video", "copy", "campanha", "site", "outro"];
const PRIORITIES = ["baixa", "media", "alta", "urgente"];
const STATUSES = [
  "aberto",
  "em_andamento",
  "aguardando_aprovacao",
  "aprovado",
  "concluido",
  "arquivado",
];

export async function createBriefing(input: {
  title: string;
  kind: string;
  priority: string;
  leadId?: string | null;
  assigneeId?: string | null;
  dueDate?: string | null;
  descriptionHtml: string;
}) {
  const profile = await getProfile();
  const supabase = await createClient();
  const title = (input.title ?? "").trim();
  if (!title) return { error: "Dá um título pro briefing." };
  const { data, error } = await supabase
    .from("briefings")
    .insert({
      title: title.slice(0, 160),
      kind: KINDS.includes(input.kind) ? input.kind : "outro",
      priority: PRIORITIES.includes(input.priority) ? input.priority : "media",
      lead_id: input.leadId || null,
      assignee_id: input.assigneeId || null,
      due_date: input.dueDate || null,
      description_html: sanitizeHtml(input.descriptionHtml),
      requester_id: profile.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/briefings");
  return { ok: true, id: data.id as string };
}

export async function updateBriefing(
  id: string,
  patch: {
    status?: string;
    priority?: string;
    assigneeId?: string | null;
    dueDate?: string | null;
    descriptionHtml?: string;
    title?: string;
  }
) {
  await getProfile();
  const supabase = await createClient();
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status && STATUSES.includes(patch.status)) upd.status = patch.status;
  if (patch.priority && PRIORITIES.includes(patch.priority))
    upd.priority = patch.priority;
  if (patch.assigneeId !== undefined) upd.assignee_id = patch.assigneeId || null;
  if (patch.dueDate !== undefined) upd.due_date = patch.dueDate || null;
  if (patch.descriptionHtml !== undefined)
    upd.description_html = sanitizeHtml(patch.descriptionHtml);
  if (patch.title !== undefined) upd.title = patch.title.trim().slice(0, 160);
  const { error } = await supabase.from("briefings").update(upd).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/briefings");
  return { ok: true };
}

export async function addBriefingComment(
  briefingId: string,
  body: string,
  kind: "comentario" | "aprovacao" | "ajuste" = "comentario"
) {
  const profile = await getProfile();
  const supabase = await createClient();
  const text = (body ?? "").trim();
  if (!text) return { error: "Comentário vazio." };
  const { error } = await supabase.from("briefing_comments").insert({
    briefing_id: briefingId,
    author_id: profile.id,
    kind,
    body: text.slice(0, 4000),
  });
  if (error) return { error: error.message };
  // aprovação/ajuste também move o status do briefing
  if (kind === "aprovacao")
    await supabase
      .from("briefings")
      .update({ status: "aprovado", updated_at: new Date().toISOString() })
      .eq("id", briefingId);
  if (kind === "ajuste")
    await supabase
      .from("briefings")
      .update({ status: "em_andamento", updated_at: new Date().toISOString() })
      .eq("id", briefingId);
  revalidatePath("/briefings");
  return { ok: true };
}

/** Upload de referência visual pro bucket público (via service role). */
export async function uploadBriefingRef(briefingId: string, fd: FormData) {
  await getProfile();
  const file = fd.get("file") as File | null;
  if (!file || !file.size) return { error: "Arquivo vazio." };
  if (file.size > 25 * 1024 * 1024) return { error: "Arquivo acima de 25MB." };

  const admin = createAdminClient();
  const { data: brief } = await admin
    .from("briefings")
    .select("id, refs")
    .eq("id", briefingId)
    .maybeSingle();
  if (!brief) return { error: "Briefing não encontrado." };

  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 80);
  const path = `briefings/${briefingId}/${Date.now()}-${safeName}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from("ops-assets")
    .upload(path, buf, { contentType: file.type || "application/octet-stream" });
  if (upErr) return { error: `Upload falhou: ${upErr.message}` };
  const url = admin.storage.from("ops-assets").getPublicUrl(path).data.publicUrl;

  const refs = [
    ...(((brief as { refs?: { name: string; url: string }[] }).refs) ?? []),
    { name: file.name, url },
  ];
  await admin
    .from("briefings")
    .update({ refs, updated_at: new Date().toISOString() })
    .eq("id", briefingId);
  revalidatePath("/briefings");
  return { ok: true, name: file.name, url };
}

export async function deleteBriefing(id: string) {
  await getProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("briefings").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/briefings");
  return { ok: true };
}
