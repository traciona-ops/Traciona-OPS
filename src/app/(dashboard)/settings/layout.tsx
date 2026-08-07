import { redirect } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  SettingsNav,
  SettingsBreadcrumb,
} from "@/components/settings/settings-nav";

// Área de Configurações (estilo Groner): submenu lateral próprio com grupos
// + breadcrumb; cada assunto vive na sua rota (/settings/*).

export const metadata = { title: "Configurações" };

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();
  if (!can.manageTeam(profile.role)) redirect("/");

  return (
    <>
      <Topbar title="Configurações" subtitle="Conta, equipe, funis e integrações" />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <SettingsNav />
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-4xl">
            <SettingsBreadcrumb />
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
