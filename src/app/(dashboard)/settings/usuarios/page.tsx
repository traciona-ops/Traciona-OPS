import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TeamTable } from "@/components/settings/team-table";
import type { Profile } from "@/lib/types";

export const metadata = { title: "Usuários" };

export default async function UsuariosPage() {
  const profile = await getProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at");
  const team = (data ?? []) as Profile[];

  return <TeamTable initialTeam={team} currentUserId={profile.id} />;
}
