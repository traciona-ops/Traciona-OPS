import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole, Sector } from "@/lib/types";

type AdminClient = SupabaseClient;

function traduz(msg: string): string {
  if (msg.includes("already been registered") || msg.includes("already exists"))
    return "Esse e-mail já tem conta.";
  if (msg.toLowerCase().includes("password"))
    return "Senha inválida (mínimo 6 caracteres).";
  return msg;
}

/** A operação deixaria o sistema sem NENHUM admin ativo? (auto-lockout) */
async function wouldRemoveLastAdmin(
  admin: AdminClient,
  targetId: string
): Promise<boolean> {
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .eq("active", true);
  const admins = (data ?? []).map((r) => (r as { id: string }).id);
  return admins.length === 1 && admins[0] === targetId;
}

export async function updateMyAvatarDomain(
  admin: AdminClient,
  meId: string,
  file: File
): Promise<{ ok: true; url: string } | { error: string }> {
  if (!file.type.startsWith("image/"))
    return { error: "Envie uma imagem (JPG/PNG)." };
  if (file.size > 5 * 1024 * 1024)
    return { error: "Imagem acima de 5MB." };

  const buf = Buffer.from(await file.arrayBuffer());
  const path = `profile-${meId}.jpg`;
  const { error: upErr } = await admin.storage
    .from("avatars")
    .upload(path, buf, { contentType: file.type, upsert: true });
  if (upErr) return { error: `Upload falhou: ${upErr.message}` };

  const publicUrl = admin.storage.from("avatars").getPublicUrl(path).data
    .publicUrl;
  const finalUrl = `${publicUrl}?v=${Date.now()}`;
  const { error } = await admin
    .from("profiles")
    .update({ avatar_url: finalUrl })
    .eq("id", meId);
  if (error) return { error: error.message };
  return { ok: true, url: finalUrl };
}

export async function removeMyAvatarDomain(
  admin: AdminClient,
  meId: string
): Promise<{ ok: true }> {
  await admin.storage.from("avatars").remove([`profile-${meId}.jpg`]);
  await admin.from("profiles").update({ avatar_url: null }).eq("id", meId);
  return { ok: true };
}

export async function createTeamMemberDomain(
  admin: AdminClient,
  input: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    sector: Sector;
  }
): Promise<{ ok: true } | { error: string }> {
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name },
  });

  if (error) return { error: traduz(error.message) };
  const id = data.user?.id;
  if (!id) return { error: "Falha ao criar usuário." };

  const { error: pErr } = await admin.from("profiles").upsert({
    id,
    name: input.name,
    email: input.email,
    role: input.role,
    sector: input.sector,
    active: true,
  });
  if (pErr) return { error: pErr.message };
  return { ok: true };
}

export async function updateMemberSectorDomain(
  admin: AdminClient,
  id: string,
  sector: Sector
): Promise<{ ok: true } | { error: string }> {
  const { error } = await admin.from("profiles").update({ sector }).eq("id", id);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function updateMemberRoleDomain(
  admin: AdminClient,
  id: string,
  role: UserRole
): Promise<{ ok: true } | { error: string }> {
  if (role !== "admin" && (await wouldRemoveLastAdmin(admin, id))) {
    return { error: "Precisa haver ao menos um admin ativo no sistema." };
  }
  const { error } = await admin.from("profiles").update({ role }).eq("id", id);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function toggleMemberActiveDomain(
  admin: AdminClient,
  id: string,
  active: boolean
): Promise<{ ok: true } | { error: string }> {
  if (!active && (await wouldRemoveLastAdmin(admin, id))) {
    return { error: "Precisa haver ao menos um admin ativo no sistema." };
  }
  const { error } = await admin
    .from("profiles")
    .update({ active })
    .eq("id", id);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function deleteTeamMemberDomain(
  admin: AdminClient,
  actorId: string,
  id: string
): Promise<{ ok: true } | { error: string }> {
  if (actorId === id) return { error: "Você não pode remover a si mesmo." };
  if (await wouldRemoveLastAdmin(admin, id)) {
    return { error: "Precisa haver ao menos um admin ativo no sistema." };
  }
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return { error: error.message };
  return { ok: true };
}
