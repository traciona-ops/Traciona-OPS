"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

// Actions da Biblioteca de Prompts & IA. Todo save gera versão do conteúdo
// anterior — histórico completo, nada se perde.

export async function createPromptFolder(name: string) {
  await getProfile();
  const supabase = await createClient();
  const n = (name ?? "").trim();
  if (!n) return { error: "Dá um nome pra pasta." };
  const { data, error } = await supabase
    .from("prompt_folders")
    .insert({ name: n.slice(0, 60) })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/prompts");
  return { ok: true, id: data.id as string };
}

export async function deletePromptFolder(id: string) {
  await getProfile();
  const supabase = await createClient();
  // prompts da pasta ficam soltos (folder_id null), não são apagados
  const { error } = await supabase.from("prompt_folders").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/prompts");
  return { ok: true };
}

export async function createPrompt(folderId: string | null, title: string) {
  const profile = await getProfile();
  const supabase = await createClient();
  const t = (title ?? "").trim() || "Novo prompt";
  const { data, error } = await supabase
    .from("prompts")
    .insert({
      folder_id: folderId || null,
      title: t.slice(0, 120),
      content: "",
      updated_by: profile.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/prompts");
  return { ok: true, id: data.id as string };
}

export async function savePrompt(
  id: string,
  patch: { title?: string; content?: string; folderId?: string | null }
) {
  const profile = await getProfile();
  const supabase = await createClient();

  // versiona o conteúdo ANTERIOR quando ele muda
  if (patch.content !== undefined) {
    const { data: current } = await supabase
      .from("prompts")
      .select("content")
      .eq("id", id)
      .maybeSingle();
    const prev = (current as { content?: string } | null)?.content ?? "";
    if (prev.trim() && prev !== patch.content) {
      await supabase.from("prompt_versions").insert({
        prompt_id: id,
        content: prev,
        author_id: profile.id,
      });
    }
  }

  const upd: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: profile.id,
  };
  if (patch.title !== undefined) upd.title = patch.title.trim().slice(0, 120);
  if (patch.content !== undefined) upd.content = patch.content.slice(0, 60000);
  if (patch.folderId !== undefined) upd.folder_id = patch.folderId || null;

  const { error } = await supabase.from("prompts").update(upd).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/prompts");
  return { ok: true };
}

export async function deletePrompt(id: string) {
  await getProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("prompts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/prompts");
  return { ok: true };
}

export async function getPromptVersions(promptId: string) {
  await getProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("prompt_versions")
    .select("id, content, created_at, author:profiles(name)")
    .eq("prompt_id", promptId)
    .order("created_at", { ascending: false })
    .limit(30);
  return (data ?? []) as unknown as {
    id: string;
    content: string;
    created_at: string;
    author: { name: string } | null;
  }[];
}

export async function restorePromptVersion(promptId: string, versionId: string) {
  await getProfile();
  const supabase = await createClient();
  const { data: v } = await supabase
    .from("prompt_versions")
    .select("content")
    .eq("id", versionId)
    .eq("prompt_id", promptId)
    .maybeSingle();
  if (!v) return { error: "Versão não encontrada." };
  return savePrompt(promptId, { content: (v as { content: string }).content });
}
