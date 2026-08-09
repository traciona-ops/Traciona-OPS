import { Sidebar } from "@/components/sidebar";
import { RoleProvider } from "@/components/context/role-context";
import { NotificationsProvider } from "@/components/context/notifications-provider";
import { ChatDockLazy } from "@/components/chat/chat-dock-lazy";
import { WhatsappBanner } from "@/components/whatsapp-banner";
import { Toaster } from "@/components/ui/toast";
import { getProfile } from "@/lib/auth";
import { getDeniedModules } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();
  const denied = await getDeniedModules(profile.role);
  const supabase = await createClient();
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  // Badges de pendência no menu (VibeUX 50): negócios no funil, contratos
  // aguardando assinatura e tarefas atrasadas — atenção sem precisar entrar.
  const [{ count }, contractsRes, tasksRes] = await Promise.all([
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .not("pipeline_id", "is", null),
    supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("status", "enviado"),
    supabase
      .from("lead_tasks")
      .select("id", { count: "exact", head: true })
      .eq("done", false)
      .lt("due_date", hoje),
  ]);

  return (
    <RoleProvider role={profile.role}>
      {/* Primeiro alvo do Tab — por isso vem antes de tudo no DOM, inclusive
          do chat flutuante. Pula a navegação e vai pro conteúdo. */}
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-[var(--radius-control)] focus:bg-[var(--color-primary)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--color-on-accent)]"
      >
        Pular para o conteúdo
      </a>
      <NotificationsProvider />
      {!denied.includes("chat") && (
        <ChatDockLazy currentUserId={profile.id} userName={profile.name} />
      )}
      <Toaster />
      {/* mobile: topbar + conteúdo em coluna; desktop: sidebar + conteúdo em linha */}
      <div className="flex h-dvh flex-col overflow-hidden md:flex-row">
        <Sidebar
          userName={profile.name}
          userAvatar={profile.avatar_url}
          role={profile.role}
          crmCount={count ?? 0}
          contractsPending={contractsRes.count ?? 0}
          tasksLate={tasksRes.count ?? 0}
          denied={denied}
        />
        {/* pb-14 mobile: espaço pra bottom bar fixa */}
        <main
          id="conteudo"
          className="flex flex-1 flex-col overflow-hidden pb-14 md:pb-0"
        >
          <WhatsappBanner />
          {children}
        </main>
      </div>
    </RoleProvider>
  );
}
