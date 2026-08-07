import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export const getProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profile) {
    // Conta desativada = fora. Sem isto, "inativo" só tirava a pessoa das
    // listas — ela continuava logando e vendo tudo.
    if ((profile as Profile).active === false) {
      redirect("/auth/signout?inactive=1");
    }
    return profile as Profile;
  }

  // Fallback if the profile row hasn't been created yet
  return {
    id: user.id,
    name: user.email?.split("@")[0] ?? "Usuário",
    email: user.email ?? null,
    role: "vendedor",
    sector: "vendas",
    avatar_url: null,
    phone: null,
    active: true,
    created_at: new Date().toISOString(),
  };
});
