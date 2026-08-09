"use client";

import { useEffect, useState } from "react";
import { useChatMessages } from "@/hooks/use-chat-messages";
import { useChatScroll } from "@/hooks/use-chat-scroll";
import { useTypingPresence } from "@/hooks/use-typing-presence";
import { ChatHeader } from "@/components/chat/conversation/chat-header";
import { MessageList } from "@/components/chat/conversation/message-list";
import { MessageComposer } from "@/components/chat/conversation/composer/message-composer";
import type { ChatLead, ChatMessage } from "@/components/chat/types";
import type { QuickReply } from "@/lib/types";

/**
 * Conversa completa (cabeçalho + thread + composer). Usada pela página do OPS
 * Chat e pelo chat dock — toda a lógica viva mora nos hooks `useChat*`.
 */
export function ChatPanel({
  lead,
  messages,
  connected,
  quickReplies,
  userName,
  owner,
  currentUserId,
  inPipeline,
  onSync,
  onOwnerChanged,
  onDelete,
  onBack,
}: {
  lead: ChatLead;
  messages: ChatMessage[];
  connected: boolean;
  quickReplies: QuickReply[];
  userName: string;
  /** Responsável atual (pro status de atendimento). */
  owner?: { id: string; name: string } | null;
  currentUserId?: string;
  /** false = conversa sem card no funil → mostra "Adicionar ao funil". */
  inPipeline?: boolean;
  /** Sincronizar: o dock re-busca o thread; sem callback, refresh da página. */
  onSync?: () => void | Promise<void>;
  onOwnerChanged?: () => void | Promise<void>;
  /** Excluir a conversa (só aparece quando fornecido — perfil com permissão). */
  onDelete?: () => void | Promise<void>;
  /** Mobile: volta pra lista de conversas (botão ← só aparece em telas pequenas). */
  onBack?: () => void;
}) {
  const { allMsgs, firstUnreadId, sending, uploading, sendText, sendMedia } =
    useChatMessages(lead.id, messages);
  const { scrollRef, awayFromBottom, onScroll, nearBottom, scrollToBottom } =
    useChatScroll(lead.id, allMsgs.length);
  const { contactTyping, pingTyping, stopTyping } = useTypingPresence(
    lead.id,
    !!lead.phone
  );

  // Responder mensagem (citação estilo WhatsApp)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  useEffect(() => setReplyTo(null), [lead.id]);

  // balão "digitando" apareceu → acompanha, se você já estava no fim
  useEffect(() => {
    if (contactTyping && nearBottom()) scrollToBottom(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactTyping]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ChatHeader
        lead={lead}
        owner={owner}
        currentUserId={currentUserId}
        inPipeline={inPipeline}
        contactTyping={contactTyping}
        onSync={onSync}
        onOwnerChanged={onOwnerChanged}
        onDelete={onDelete}
        onBack={onBack}
      />

      <MessageList
        messages={allMsgs}
        leadId={lead.id}
        leadName={lead.name}
        firstUnreadId={firstUnreadId}
        contactTyping={contactTyping}
        scrollRef={scrollRef}
        awayFromBottom={awayFromBottom}
        onScroll={onScroll}
        onScrollToBottom={() => scrollToBottom(true)}
        onReply={setReplyTo}
      />

      {!connected && (
        <div className="bg-[var(--color-danger)]/10 px-5 py-2 text-center text-xs text-[var(--color-danger)]">
          WhatsApp desconectado — conecte em Configurações → WhatsApp para enviar.
        </div>
      )}

      <MessageComposer
        lead={lead}
        quickReplies={quickReplies}
        userName={userName}
        sending={sending}
        uploading={uploading}
        replyTo={replyTo}
        onReplyTo={setReplyTo}
        sendText={sendText}
        sendMedia={sendMedia}
        onScrollToBottom={() => scrollToBottom(true)}
        pingTyping={pingTyping}
        stopTyping={stopTyping}
      />
    </div>
  );
}
