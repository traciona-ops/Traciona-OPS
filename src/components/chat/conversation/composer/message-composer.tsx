"use client";

import { useRef, useState } from "react";
import { Loader2, Mic, Send, Sparkles, X, Zap } from "lucide-react";
import { hourBR } from "@/lib/utils/dates";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { scheduleMessage } from "@/app/(dashboard)/crm/whatsapp-actions";
import { suggestReply } from "@/app/(dashboard)/crm/ai-actions";
import { QuickReplyPicker } from "@/components/chat/conversation/quick-reply-picker";
import { AttachMenu } from "@/components/chat/conversation/composer/attach-menu";
import { SchedulePopover } from "@/components/chat/conversation/composer/schedule-popover";
import { MediaPreviewDialog } from "@/components/chat/conversation/composer/media-preview-dialog";
import type { ChatLead, ChatMessage } from "@/components/chat/types";
import type { QuickReply } from "@/lib/types";
import { useRouter } from "next/navigation";

/**
 * Barra de escrita: texto, respostas rápidas, sugestão de IA, anexo, agendar,
 * áudio e a citação de "respondendo a...". O envio em si mora no
 * `useChatMessages` (bolha otimista + rollback).
 */
export function MessageComposer({
  lead,
  quickReplies,
  userName,
  sending,
  uploading,
  replyTo,
  onReplyTo,
  sendText,
  sendMedia,
  onScrollToBottom,
  pingTyping,
  stopTyping,
}: {
  lead: ChatLead;
  quickReplies: QuickReply[];
  userName: string;
  sending: boolean;
  uploading: boolean;
  replyTo: ChatMessage | null;
  onReplyTo: (m: ChatMessage | null) => void;
  sendText: (body: string, quoted: ChatMessage | null) => Promise<string | null>;
  sendMedia: (file: File, caption?: string) => Promise<string | null>;
  onScrollToBottom: () => void;
  pingTyping: () => void;
  stopTyping: () => void;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrQuery, setQrQuery] = useState("");
  const [schedOpen, setSchedOpen] = useState(false);
  const [schedWhen, setSchedWhen] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [mediaCaption, setMediaCaption] = useState("");

  const photoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const recorder = useAudioRecorder({
    onRecorded: async (file) => {
      setError(null);
      const err = await sendMedia(file);
      if (err) setError(err);
    },
    onError: setError,
  });

  async function aiSuggest() {
    if (aiBusy) return;
    setAiBusy(true);
    setError(null);
    const r = await suggestReply(lead.id);
    setAiBusy(false);
    if ("error" in r && r.error) {
      setError(r.error);
      return;
    }
    if ("text" in r && r.text) setText(r.text);
  }

  function applyTemplate(content: string) {
    const first = lead.name.split(" ")[0] || lead.name;
    const h = hourBR();
    const saud = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
    const mine = userName.split(" ")[0] || userName;
    setText(
      content
        .replace(/\{nome\}/gi, first)
        .replace(/\{saudacao\}/gi, saud)
        .replace(/\{meu_nome\}/gi, mine)
    );
    setQrOpen(false);
    setQrQuery("");
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setMediaCaption("");
    setError(null);
    setPendingFile(f); // abre a prévia com legenda
  }

  async function sendPending() {
    if (!pendingFile) return;
    setError(null);
    const err = await sendMedia(pendingFile, mediaCaption);
    if (err) {
      setError(err);
      return;
    }
    setPendingFile(null);
    setMediaCaption("");
  }

  async function send() {
    const body = text.trim();
    // guard de duplo Enter: um envio por vez
    if (!body || sending || !lead.phone) return;
    setError(null);
    const quoted = replyTo;
    setText("");
    onReplyTo(null);
    stopTyping();
    setTimeout(onScrollToBottom, 30);

    const err = await sendText(body, quoted);
    if (err) {
      setText(body); // devolve o texto pra caixa pra não perder nada
      onReplyTo(quoted);
      setError(err);
    }
  }

  async function doSchedule() {
    if (!text.trim() || !schedWhen) return;
    setScheduling(true);
    setError(null);
    const r = await scheduleMessage(
      lead.id,
      text.trim(),
      new Date(schedWhen).toISOString()
    );
    setScheduling(false);
    if (r?.error) {
      setError(r.error);
      return;
    }
    setText("");
    setSchedWhen("");
    setSchedOpen(false);
    router.refresh();
  }

  return (
    <>
      <div className="border-t border-[var(--color-border)] p-3">
        {error && (
          <p className="mb-2 rounded-lg bg-[var(--color-danger)]/10 px-3 py-1.5 text-xs text-[var(--color-danger)]">
            {error}
          </p>
        )}
        {/* barra de citação (respondendo a...) — estilo WhatsApp */}
        {replyTo && (
          <div className="mb-2 flex items-start gap-2 rounded-xl border border-[color-mix(in_srgb,var(--color-primary)_45%,var(--color-border))] bg-[var(--color-surface-2)] px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-[var(--color-primary)]">
                Respondendo {replyTo.direction === "out" ? "você" : lead.name}
              </p>
              <p className="line-clamp-2 break-words text-xs text-[var(--color-muted)]">
                {replyTo.body ?? (replyTo.media_type ? "[mídia]" : "")}
              </p>
            </div>
            <button
              onClick={() => onReplyTo(null)}
              aria-label="Cancelar resposta"
              className="flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-lg text-[var(--color-muted-2)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <input
          ref={photoRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={onFile}
        />
        <input
          ref={docRef}
          type="file"
          accept="application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,audio/*"
          className="hidden"
          onChange={onFile}
        />
        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onFile}
        />
        {recorder.recording ? (
          <div className="flex h-10 items-center gap-3 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--color-danger)]" />
            <span className="text-sm">Gravando áudio… {recorder.elapsed}</span>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => recorder.stop(false)}
                className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                aria-label="Cancelar"
                title="Cancelar"
              >
                <X className="h-4 w-4" />
              </button>
              <button
                onClick={() => recorder.stop(true)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                aria-label="Enviar áudio"
                title="Enviar"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-1.5 sm:gap-2">
            {/* mobile: só anexo + campo + enviar (estilo WhatsApp); extras no desktop */}
            <div className="relative hidden sm:block">
              <button
                onClick={() => setQrOpen((o) => !o)}
                disabled={!lead.phone}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border-strong)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                aria-label="Respostas rápidas"
                title="Respostas rápidas"
              >
                <Zap className="h-4 w-4" />
              </button>
              {qrOpen && (
                <QuickReplyPicker
                  quickReplies={quickReplies}
                  onPick={applyTemplate}
                  onClose={() => {
                    setQrOpen(false);
                    setQrQuery("");
                  }}
                  query={qrQuery}
                  onQuery={setQrQuery}
                />
              )}
            </div>
            <button
              onClick={aiSuggest}
              disabled={aiBusy || !lead.phone}
              className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border-strong)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] sm:flex"
              aria-label="Sugerir resposta com IA"
              title="IA sugere a próxima resposta (você edita antes de enviar)"
            >
              {aiBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
            </button>
            <AttachMenu
              open={attachOpen}
              onToggle={() => setAttachOpen((o) => !o)}
              onClose={() => setAttachOpen(false)}
              disabled={uploading || !lead.phone}
              uploading={uploading}
              refs={{ photo: photoRef, doc: docRef, cam: camRef }}
            />
            <SchedulePopover
              open={schedOpen}
              onToggle={() => setSchedOpen((o) => !o)}
              disabled={!lead.phone}
              when={schedWhen}
              onWhen={setSchedWhen}
              hasText={!!text.trim()}
              scheduling={scheduling}
              onSchedule={doSchedule}
            />
            <textarea
              value={text}
              onChange={(e) => {
                const v = e.target.value;
                setText(v);
                pingTyping(); // "digitando..." pro contato
                // atalho "/" no início → abre respostas rápidas já filtrando
                if (v.startsWith("/")) {
                  setQrQuery(v.slice(1));
                  setQrOpen(true);
                } else if (qrOpen && qrQuery) {
                  setQrOpen(false);
                  setQrQuery("");
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape" && qrOpen) {
                  setQrOpen(false);
                  setQrQuery("");
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey && !qrOpen) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder={lead.phone ? "Mensagem..." : "Lead sem telefone"}
              disabled={!lead.phone}
              className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2.5 text-base focus:border-[var(--color-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-50 sm:min-h-[40px] sm:text-sm"
            />
            {text.trim() ? (
              <button
                onClick={send}
                disabled={sending || !lead.phone}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
                aria-label="Enviar"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            ) : (
              <button
                onClick={recorder.start}
                disabled={uploading || !lead.phone}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
                aria-label="Gravar áudio"
                title="Gravar áudio"
              >
                <Mic className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {pendingFile && (
        <MediaPreviewDialog
          file={pendingFile}
          caption={mediaCaption}
          onCaption={setMediaCaption}
          uploading={uploading}
          onCancel={() => setPendingFile(null)}
          onSend={sendPending}
        />
      )}
    </>
  );
}
