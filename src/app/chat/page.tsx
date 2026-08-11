import type { Metadata } from "next";
import { getProfile } from "@/lib/auth";
import { requireModule } from "@/lib/access";
import { RoleProvider } from "@/components/context/role-context";
import { WhatsappBanner } from "@/components/whatsapp-banner";
import { ChatWorkspace } from "@/components/chat/workspace/chat-workspace";
import type { ChatThreadSeed, Conv } from "@/components/chat/types";
import type { QuickReply, WhatsappMessage } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";
import {
  fetchDockContextDomain,
  fetchInboxConversationsDomain,
  fetchThreadDomain,
} from "@/lib/whatsapp/inbox";

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
  const supabase = await createClient();

  const inboxR = await fetchInboxConversationsDomain(supabase);
  const initialConversations =
    "conversations" in inboxR
      ? (inboxR.conversations as Conv[])
      : undefined;

  let initialThread: ChatThreadSeed | undefined;
  if (lead) {
    const [threadR, ctxR] = await Promise.all([
      fetchThreadDomain(supabase, lead),
      fetchDockContextDomain(supabase, lead),
    ]);
    if ("messages" in threadR && "context" in ctxR) {
      initialThread = {
        messages: threadR.messages as WhatsappMessage[],
        context: ctxR.context as ChatThreadSeed["context"],
        quickReplies: (ctxR.quickReplies ?? []) as QuickReply[],
        connected: !!ctxR.connected,
      };
    }
  }

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
            initialConversations={initialConversations}
            initialThread={initialThread}
            initialPrefsOpen={prefs === "1"}
            variant="page"
          />
        </div>
      </div>
    </RoleProvider>
  );
}
