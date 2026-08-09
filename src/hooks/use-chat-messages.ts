"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/utils/media";
import {
  sendWhatsappMedia,
  sendWhatsappMessage,
} from "@/app/(dashboard)/crm/whatsapp-actions";
import type { ChatMessage } from "@/components/chat/types";

/**
 * A bolha otimista guarda o texto SEM assinatura; a mensagem real pode chegar
 * com "*Setor - Nome*\n" na frente. Considera casada se for igual OU se a
 * real terminar com o texto pendente.
 */
function matchesSent(real: string | null, pending: string | null): boolean {
  if (!real || !pending) return false;
  return real === pending || real.endsWith(`\n${pending}`);
}

export type QuotedMessage = {
  providerMsgId: string | null;
  body: string | null;
  direction: ChatMessage["direction"];
};

/**
 * Estado vivo do thread: histórico vindo do servidor + bolhas otimistas +
 * realtime cirúrgico (INSERT/UPDATE do lead entram direto no estado, sem
 * re-renderizar a página inteira). Também concentra o envio de texto e mídia,
 * porque a bolha otimista e o rollback fazem parte do mesmo estado.
 */
export function useChatMessages(leadId: string, messages: ChatMessage[]) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [msgs, setMsgs] = useState<ChatMessage[]>(messages);
  const [pendingMsgs, setPendingMsgs] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setMsgs(messages);
    // reconcilia: pendente que já apareceu no servidor sai da lista local
    setPendingMsgs((prev) =>
      prev.filter(
        (p) =>
          !messages.some(
            (m) => m.direction === "out" && matchesSent(m.body, p.body)
          )
      )
    );
  }, [messages, leadId]);

  useEffect(() => {
    const channel = supabase
      .channel(`wa-chat-${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_messages",
          filter: `lead_id=eq.${leadId}`,
        },
        (payload) => {
          const m = payload.new as ChatMessage;
          setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          if (m.direction === "out") {
            setPendingMsgs((prev) =>
              prev.filter((p) => !matchesSent(m.body, p.body))
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "whatsapp_messages",
          filter: `lead_id=eq.${leadId}`,
        },
        (payload) => {
          const m = payload.new as ChatMessage;
          // ticks entregue/lido, reações e edições atualizam ao vivo
          setMsgs((prev) =>
            prev.map((x) =>
              x.id === m.id
                ? { ...x, status: m.status, reaction: m.reaction, body: m.body }
                : x
            )
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, leadId]);

  const allMsgs = useMemo(
    () => [...msgs, ...pendingMsgs],
    [msgs, pendingMsgs]
  );

  // Divisor "Não lidas": congela a primeira não-lida de quando a conversa abriu
  const firstUnreadRef = useRef<{ lead: string; id: string | null }>({
    lead: "",
    id: null,
  });
  if (firstUnreadRef.current.lead !== leadId) {
    firstUnreadRef.current = {
      lead: leadId,
      id: messages.find((m) => m.direction === "in" && !m.read_at)?.id ?? null,
    };
  }
  const firstUnreadId = firstUnreadRef.current.id;

  /** Envia texto com bolha otimista. Devolve a mensagem de erro, ou null. */
  async function sendText(
    body: string,
    quoted: ChatMessage | null
  ): Promise<string | null> {
    setSending(true);
    const quotedSnippet = quoted
      ? (quoted.body ?? (quoted.media_type ? "[mídia]" : "")).slice(0, 180)
      : null;
    // otimista: a bolha aparece NA HORA com status "enviando"
    const tmp: ChatMessage = {
      id: `tmp-${Date.now()}`,
      lead_id: leadId,
      direction: "out",
      body,
      media_url: null,
      media_type: null,
      status: "sending",
      provider: "dinastia",
      provider_msg_id: null,
      sent_by: null,
      read_at: null,
      reaction: null,
      reply_to_body: quotedSnippet,
      reply_to_dir: quoted?.direction ?? null,
      created_at: new Date().toISOString(),
    };
    setPendingMsgs((prev) => [...prev, tmp]);

    const r = await sendWhatsappMessage(
      leadId,
      body,
      quoted
        ? {
            providerMsgId: quoted.provider_msg_id,
            body: quotedSnippet,
            direction: quoted.direction,
          }
        : undefined
    );
    setSending(false);
    if (r?.error) {
      setPendingMsgs((prev) => prev.filter((p) => p.id !== tmp.id));
      return r.error;
    }
    router.refresh();
    return null;
  }

  /** Sobe arquivo (imagem já comprimida). Devolve a mensagem de erro, ou null. */
  async function sendMedia(
    file: File,
    caption?: string
  ): Promise<string | null> {
    setUploading(true);
    const fd = new FormData();
    fd.append("leadId", leadId);
    // foto de celular (~4MB) vira JPEG ~300KB antes de subir
    fd.append("file", await compressImage(file));
    if (caption?.trim()) fd.append("caption", caption.trim());
    const r = await sendWhatsappMedia(fd);
    setUploading(false);
    if (r?.error) return r.error;
    router.refresh();
    return null;
  }

  return { allMsgs, firstUnreadId, sending, uploading, sendText, sendMedia };
}
