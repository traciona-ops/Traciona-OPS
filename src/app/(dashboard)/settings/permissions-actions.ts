"use server";

import { getProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { MODULES, type ModuleKey } from "@/lib/modules";
import type { UserRole } from "@/lib/types";

// Ações da matriz de Permissões de acesso. Só guardamos NEGAÇÕES
// (allowed=false); liberar de novo apaga a linha. Admin não é editável.

const EDITABLE_ROLES: UserRole[] = ["gestor", "vendedor"];

async function ensureAdmin() {
  const profile = await getProfile();
  if (!can.manageTeam(profile.role)) throw new Error("Sem permissão.");
}

export async function getRoleDenials(): Promise<
  Record<string, string[]>
> {
  await ensureAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("role_permissions")
    .select("role, module")
    .eq("allowed", false);
  const out: Record<string, string[]> = { gestor: [], vendedor: [] };
  for (const row of data ?? []) {
    (out[row.role as string] ??= []).push(row.module as string);
  }
  return out;
}

export async function setRolePermission(
  role: UserRole,
  module: ModuleKey,
  allowed: boolean
) {
  await ensureAdmin();
  if (!EDITABLE_ROLES.includes(role))
    return { error: "O perfil Admin sempre vê tudo." };
  if (!MODULES.some((m) => m.key === module))
    return { error: "Módulo desconhecido." };

  const admin = createAdminClient();
  if (allowed) {
    const { error } = await admin
      .from("role_permissions")
      .delete()
      .eq("role", role)
      .eq("module", module);
    if (error) return { error: error.message };
  } else {
    const { error } = await admin
      .from("role_permissions")
      .upsert(
        { role, module, allowed: false, updated_at: new Date().toISOString() },
        { onConflict: "role,module" }
      );
    if (error) return { error: error.message };
  }
  return { ok: true };
}
