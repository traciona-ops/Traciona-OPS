import { getProfile } from "@/lib/auth";
import { AccountCard } from "@/components/settings/account-card";
import { ROLE_LABEL } from "@/lib/permissions";

export const metadata = { title: "Minha conta" };

export default async function ContaPage() {
  const profile = await getProfile();
  return (
    <AccountCard
      name={profile.name}
      email={profile.email}
      roleLabel={ROLE_LABEL[profile.role]}
      avatarUrl={profile.avatar_url}
    />
  );
}
