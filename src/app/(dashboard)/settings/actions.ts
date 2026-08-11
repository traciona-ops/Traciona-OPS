"use server";

import { revalidatePath } from "next/cache";
import { headers as nextHeaders } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can, NOT_ALLOWED } from "@/lib/permissions";
import type { UserRole, Sector } from "@/lib/types";
import {
  updateMyAvatarDomain,
  removeMyAvatarDomain,
  createTeamMemberDomain,
  updateMemberSectorDomain,
  updateMemberRoleDomain,
  toggleMemberActiveDomain,
  deleteTeamMemberDomain,
} from "@/lib/settings/team";
import { setMonthlyGoalDomain } from "@/lib/settings/goals";
import {
  getWhatsappStateDomain,
  connectWhatsappDomain,
  fetchWhatsappQRDomain,
  disconnectWhatsappDomain,
  logoutWhatsappDomain,
  listWaNumbersDomain,
  addWaNumberDomain,
  renameWaNumberDomain,
  removeWaNumberDomain,
  syncAvatarsDomain,
  requestChatHistoryDomain,
} from "@/lib/settings/wa-session";
import {
  createTeamMemberSchema,
  updateMemberSectorSchema,
  updateMemberRoleSchema,
  toggleMemberActiveSchema,
  deleteTeamMemberSchema,
  setMonthlyGoalSchema,
  addWaNumberSchema,
  renameWaNumberSchema,
  removeWaNumberSchema,
} from "@/lib/settings/schemas";

async function requireAdmin(): Promise<
  { id: string } | { error: string }
> {
  const profile = await getProfile();
  if (!can.manageTeam(profile.role)) return { error: NOT_ALLOWED };
  return { id: profile.id };
}

function zodError(err: { issues: { message: string }[] }) {
  return { error: err.issues[0]?.message ?? "Dados inválidos." };
}

/** Cada um sobe a PRÓPRIA foto de perfil (escopo travado ao id do logado). */
export async function updateMyAvatar(formData: FormData) {
  const me = await getProfile();
  const file = formData.get("file") as File | null;
  if (!file) return { error: "Nenhum arquivo enviado." };
  const r = await updateMyAvatarDomain(createAdminClient(), me.id, file);
  if ("error" in r) return r;
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return r;
}

/** Remove a própria foto → volta pras iniciais. */
export async function removeMyAvatar() {
  const me = await getProfile();
  await removeMyAvatarDomain(createAdminClient(), me.id);
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function createTeamMember(input: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  sector: Sector;
}) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  const parsed = createTeamMemberSchema.safeParse(input);
  if (!parsed.success) return zodError(parsed.error);
  const r = await createTeamMemberDomain(createAdminClient(), parsed.data);
  if ("error" in r) return r;
  revalidatePath("/settings");
  revalidatePath("/crm");
  return r;
}

export async function updateMemberSector(id: string, sector: Sector) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  const parsed = updateMemberSectorSchema.safeParse({ id, sector });
  if (!parsed.success) return zodError(parsed.error);
  const r = await updateMemberSectorDomain(
    createAdminClient(),
    parsed.data.id,
    parsed.data.sector
  );
  if ("error" in r) return r;
  revalidatePath("/settings");
  revalidatePath("/crm");
  return r;
}

export async function updateMemberRole(id: string, role: UserRole) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  const parsed = updateMemberRoleSchema.safeParse({ id, role });
  if (!parsed.success) return zodError(parsed.error);
  const r = await updateMemberRoleDomain(
    createAdminClient(),
    parsed.data.id,
    parsed.data.role
  );
  if ("error" in r) return r;
  revalidatePath("/settings");
  return r;
}

export async function toggleMemberActive(id: string, active: boolean) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  const parsed = toggleMemberActiveSchema.safeParse({ id, active });
  if (!parsed.success) return zodError(parsed.error);
  const r = await toggleMemberActiveDomain(
    createAdminClient(),
    parsed.data.id,
    parsed.data.active
  );
  if ("error" in r) return r;
  revalidatePath("/settings");
  revalidatePath("/crm");
  return r;
}

export async function deleteTeamMember(id: string) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  const parsed = deleteTeamMemberSchema.safeParse({ id });
  if (!parsed.success) return zodError(parsed.error);
  const r = await deleteTeamMemberDomain(
    createAdminClient(),
    guard.id,
    parsed.data.id
  );
  if ("error" in r) return r;
  revalidatePath("/settings");
  revalidatePath("/crm");
  return r;
}

export async function setMonthlyGoal(month: string, target: number) {
  const profile = await getProfile();
  if (!["admin", "gestor"].includes(profile.role)) return { error: NOT_ALLOWED };
  const parsed = setMonthlyGoalSchema.safeParse({ month, target: Number(target) });
  if (!parsed.success) return zodError(parsed.error);
  const supabase = await createClient();
  const r = await setMonthlyGoalDomain(
    supabase,
    parsed.data.month,
    parsed.data.target
  );
  if ("error" in r) return r;
  revalidatePath("/");
  return r;
}

export async function getWhatsappState(numberId?: string) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  return await getWhatsappStateDomain(numberId);
}

export async function connectWhatsapp(numberId?: string) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  return await connectWhatsappDomain(numberId);
}

export async function fetchWhatsappQR() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  return await fetchWhatsappQRDomain();
}

export async function disconnectWhatsapp(numberId?: string) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  return await disconnectWhatsappDomain(numberId);
}

export async function logoutWhatsapp(numberId?: string) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  return await logoutWhatsappDomain(numberId);
}

export async function listWaNumbers() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  return await listWaNumbersDomain(createAdminClient());
}

export async function addWaNumber(name: string) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  const parsed = addWaNumberSchema.safeParse({ name });
  if (!parsed.success) return zodError(parsed.error);
  const h = await nextHeaders();
  const r = await addWaNumberDomain(createAdminClient(), parsed.data.name, {
    host: h.get("x-forwarded-host") ?? h.get("host") ?? "",
    proto: h.get("x-forwarded-proto") ?? "https",
    secret: process.env.WHATSAPP_WEBHOOK_SECRET ?? "",
  });
  return r;
}

export async function renameWaNumber(id: string, name: string) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  const parsed = renameWaNumberSchema.safeParse({ id, name });
  if (!parsed.success) return zodError(parsed.error);
  return await renameWaNumberDomain(
    createAdminClient(),
    parsed.data.id,
    parsed.data.name
  );
}

export async function removeWaNumber(id: string) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  const parsed = removeWaNumberSchema.safeParse({ id });
  if (!parsed.success) return zodError(parsed.error);
  return await removeWaNumberDomain(createAdminClient(), parsed.data.id);
}

export async function syncAvatars() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  const r = await syncAvatarsDomain(createAdminClient());
  revalidatePath("/crm");
  revalidatePath("/crm/mensagens");
  return r;
}

export async function requestChatHistory() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  return await requestChatHistoryDomain();
}
