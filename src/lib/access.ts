import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import type { Profile, UserRole } from "@/lib/types";
import type { ModuleKey } from "@/lib/modules";

// Permissões de acesso por módulo (Configurações → Permissões de acesso).
// Regra: ausência de linha em role_permissions = liberado; admin vê tudo.
// Isto esconde menu e bloqueia rota; dados sensíveis seguem na RLS.
// O catálogo de módulos vive em lib/modules.ts (client-safe).

export type { ModuleKey } from "@/lib/modules";
export { MODULES } from "@/lib/modules";

/** Módulos NEGADOS pro perfil (cache por request). Admin: nunca nega. */
export const getDeniedModules = cache(
  async (role: UserRole): Promise<string[]> => {
    if (role === "admin") return [];
    const supabase = await createClient();
    const { data } = await supabase
      .from("role_permissions")
      .select("module")
      .eq("role", role)
      .eq("allowed", false);
    return (data ?? []).map((r) => r.module as string);
  }
);

/** Trava de rota: sem permissão no módulo → volta pro Início. */
export async function requireModule(module: ModuleKey): Promise<Profile> {
  const profile = await getProfile();
  const denied = await getDeniedModules(profile.role);
  if (denied.includes(module)) redirect("/");
  return profile;
}
