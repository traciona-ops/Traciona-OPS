import type { Metadata } from "next";
import { getProfile } from "@/lib/auth";
import { requireModule } from "@/lib/access";
import { RoleProvider } from "@/components/context/role-context";
import { WhatsappBanner } from "@/components/whatsapp-banner";
import { ChatWorkspace } from "@/components/chat/workspace/chat-workspace";

// Mensageria como APP SEPARADO: tela cheia, sem a barra lateral do sistema.
// É o mesmo ChatWorkspace do popup. Aberto em nova guia pelo ↗ do chat.

export const metadata: Metadata = { title: "OPS Chat" };

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string; prefs?: string }>;
}) {
  await requireModule("chat");
  const { lead, prefs } = await searchParams;
  const profile = await getProfile();

  return (
    <RoleProvider role={profile.role}>
      {/* h-dvh: no celular a barra do navegador não "come" o composer */}
      <div className="flex h-dvh flex-col overflow-hidden">
        <WhatsappBanner />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <ChatWorkspace
            currentUserId={profile.id}
            userName={profile.name}
            initialLeadId={lead}
            initialPrefsOpen={prefs === "1"}
            variant="page"
          />
        </div>
      </div>
    </RoleProvider>
  );
}
