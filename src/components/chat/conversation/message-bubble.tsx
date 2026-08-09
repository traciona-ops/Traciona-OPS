"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCheck,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Pencil,
  Reply,
  SmilePlus,
  Trash2,
} from "lucide-react";
import { fmtTimeBR } from "@/lib/utils/dates";
import {
  deleteMessageForAll,
  editWhatsappMessage,
  reactToMessage,
} from "@/app/(dashboard)/crm/whatsapp-actions";
import type { ChatMessage } from "@/components/chat/types";

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

/** Renderiza *negrito* e _itálico_ do WhatsApp dentro da bolha. */
function renderWaText(body: string): React.ReactNode[] {
  return body.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((part, i) => {
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <b key={i}>{part.slice(1, -1)}</b>;
    }
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) {
      return <i key={i}>{part.slice(1, -1)}</i>;
    }
    return part;
  });
}

/** Cartão de documento estilo WhatsApp: nome, selo do tipo, abrir e baixar. */
function DocumentCard({ url, out }: { url: string; out: boolean }) {
  const rawName = decodeURIComponent(
    url.split("?")[0].split("/").pop() ?? "documento"
  );
  const isPdf = /\.pdf$/i.test(rawName);
  const ext = rawName.includes(".")
    ? rawName.split(".").pop()!.toUpperCase()
    : "ARQUIVO";
  // Supabase Storage: ?download=nome força o Content-Disposition
  const downloadUrl = `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(
    rawName
  )}`;
  const actionClass = out
    ? "text-[var(--color-primary-foreground)]/80 hover:bg-[color-mix(in_srgb,var(--color-primary-foreground)_15%,transparent)] hover:text-[var(--color-primary-foreground)]"
    : "text-[var(--color-muted)] hover:bg-[var(--color-border)]/60 hover:text-[var(--color-primary)]";

  return (
    <div
      className={`mb-1 flex w-64 max-w-full items-center gap-2.5 rounded-xl px-2.5 py-2 ${
        out
          ? "bg-[color-mix(in_srgb,var(--color-primary-foreground)_15%,transparent)]"
          : "bg-[var(--color-surface-2)]"
      }`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
          isPdf
            ? "bg-[var(--color-danger)]/15 text-[var(--color-danger)]"
            : out
            ? "bg-[color-mix(in_srgb,var(--color-primary-foreground)_20%,transparent)] text-[var(--color-primary-foreground)]"
            : "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
        }`}
      >
        <FileText className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium leading-tight">{rawName}</p>
        <p
          className={`text-[11px] font-semibold uppercase tracking-wide ${
            out
              ? "text-[var(--color-primary-foreground)]/70"
              : "text-[var(--color-muted-2)]"
          }`}
        >
          {isPdf ? "PDF" : ext}
        </p>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        title="Abrir"
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${actionClass}`}
      >
        <ExternalLink className="h-4 w-4" />
      </a>
      <a
        href={downloadUrl}
        title="Baixar"
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${actionClass}`}
      >
        <Download className="h-4 w-4" />
      </a>
    </div>
  );
}

/** Ticks de status (enviando / enviado / entregue / lido) das nossas bolhas. */
function StatusTicks({ status }: { status: ChatMessage["status"] }) {
  if (status === "sending")
    return (
      <span className="flex items-center gap-0.5">
        <Clock className="h-3 w-3" />
      </span>
    );
  if (status === "read")
    return (
      <span className="flex items-center gap-0.5 text-[var(--color-primary-foreground)]">
        lido <CheckCheck className="h-3.5 w-3.5" />
      </span>
    );
  if (status === "delivered")
    return (
      <span className="flex items-center gap-0.5">
        entregue <CheckCheck className="h-3.5 w-3.5" />
      </span>
    );
  return (
    <span className="flex items-center gap-0.5">
      enviado <Check className="h-3.5 w-3.5" />
    </span>
  );
}

export function MessageBubble({
  m,
  leadId,
  leadName = "",
  onReply,
}: {
  m: ChatMessage;
  leadId: string;
  leadName?: string;
  onReply?: (m: ChatMessage) => void;
}) {
  const router = useRouter();
  const out = m.direction === "out";
  const [pickerOpen, setPickerOpen] = useState(false);

  async function react(emoji: string) {
    setPickerOpen(false);
    if (!m.provider_msg_id) return;
    const next = m.reaction === emoji ? "" : emoji;
    await reactToMessage(leadId, m.provider_msg_id, m.direction, next);
    router.refresh();
  }

  // editar / apagar pra todos — só nas NOSSAS mensagens já entregues
  async function editMsg() {
    const novo = prompt("Editar mensagem:", m.body ?? "");
    if (!novo || !novo.trim() || novo.trim() === m.body) return;
    const r = await editWhatsappMessage(leadId, m.provider_msg_id!, novo.trim());
    if (r && "error" in r && r.error) {
      alert(`Não foi possível editar: ${r.error}`);
      return;
    }
    router.refresh();
  }

  async function delMsg() {
    if (!confirm("Apagar esta mensagem PRA TODOS? Ela some no celular do contato."))
      return;
    const r = await deleteMessageForAll(leadId, m.provider_msg_id!);
    if (r && "error" in r && r.error) {
      alert(`Não foi possível apagar: ${r.error}`);
      return;
    }
    router.refresh();
  }

  const canManage = out && !!m.provider_msg_id && m.status !== "sending";
  const editBtn =
    canManage && m.body && !m.media_url ? (
      <button
        onClick={editMsg}
        className="flex min-h-9 min-w-9 items-center justify-center self-center rounded-full text-[var(--color-muted-2)] opacity-0 transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] group-hover:opacity-100"
        title="Editar mensagem"
        aria-label="Editar mensagem"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    ) : null;
  const delBtn = canManage ? (
    <button
      onClick={delMsg}
      className="flex h-11 w-11 items-center justify-center self-center rounded-full text-[var(--color-muted-2)] opacity-0 transition hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] group-hover:opacity-100"
      title="Apagar pra todos"
      aria-label="Apagar mensagem pra todos"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  ) : null;

  const replyBtn =
    onReply && m.provider_msg_id ? (
      <button
        onClick={() => onReply(m)}
        className="flex min-h-9 min-w-9 items-center justify-center self-center rounded-full text-[var(--color-muted-2)] opacity-0 transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] group-hover:opacity-100"
        title="Responder"
        aria-label="Responder mensagem"
      >
        <Reply className="h-4 w-4" />
      </button>
    ) : null;

  const reactBtn = m.provider_msg_id ? (
    <div className="relative self-center opacity-0 transition group-hover:opacity-100">
      <button
        onClick={() => setPickerOpen((o) => !o)}
        className="flex min-h-9 min-w-9 items-center justify-center rounded-full text-[var(--color-muted-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
        aria-label="Reagir"
      >
        <SmilePlus className="h-4 w-4" />
      </button>
      {pickerOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
          <div className="absolute bottom-8 left-1/2 z-20 flex -translate-x-1/2 gap-1 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1 shadow-xl">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => react(e)}
                className="text-lg transition hover:scale-125"
              >
                {e}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  ) : null;

  return (
    <div
      className={`group flex items-center gap-1.5 ${
        out ? "justify-end" : "justify-start"
      }`}
    >
      {out && delBtn}
      {out && editBtn}
      {out && replyBtn}
      {out && reactBtn}
      <div
        className={`relative max-w-[70%] rounded-2xl px-3.5 py-2 text-sm ${
          out ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]" : "card"
        } ${m.status === "failed" ? "ring-1 ring-[var(--color-danger)]" : ""} ${
          m.reaction ? "mb-2" : ""
        }`}
      >
        {/* citação (responder mensagem) — estilo WhatsApp */}
        {m.reply_to_body && (
          <div
            className={`mb-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
              out
                ? "border-[color-mix(in_srgb,var(--color-primary-foreground)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-primary-foreground)_15%,transparent)] text-[color-mix(in_srgb,var(--color-primary-foreground)_90%,transparent)]"
                : "border-[color-mix(in_srgb,var(--color-primary)_45%,var(--color-border))] bg-[var(--color-surface-2)] text-[var(--color-muted)]"
            }`}
          >
            <p
              className={`mb-0.5 text-[11px] font-bold ${
                out ? "text-[var(--color-primary-foreground)]" : "text-[var(--color-primary)]"
              }`}
            >
              {m.reply_to_dir === "out" ? "Você" : leadName || "Contato"}
            </p>
            <p className="line-clamp-2 break-words">{m.reply_to_body}</p>
          </div>
        )}
        {m.media_url && m.media_type === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={m.media_url}
            alt="Imagem enviada na conversa"
            loading="lazy"
            decoding="async"
            className="mb-1 max-h-64 w-full rounded-lg object-cover"
          />
        )}
        {m.media_url && m.media_type === "audio" && (
          <audio controls src={m.media_url} className="mb-1 w-56" />
        )}
        {m.media_url && m.media_type === "video" && (
          <video
            controls
            preload="metadata"
            src={m.media_url}
            className="mb-1 max-h-64 w-full rounded-lg"
          />
        )}
        {m.media_url && m.media_type === "document" && (
          <DocumentCard url={m.media_url} out={out} />
        )}
        {m.body && (
          <p className="whitespace-pre-wrap break-words">{renderWaText(m.body)}</p>
        )}
        <div
          className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${
            out ? "text-[var(--color-primary-foreground)]/70" : "text-[var(--color-muted-2)]"
          }`}
        >
          {fmtTimeBR(m.created_at)}
          {out && m.status !== "failed" && <StatusTicks status={m.status} />}
          {m.status === "failed" && <span>· falhou</span>}
        </div>
        {m.reaction && (
          <span className="absolute -bottom-3 right-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-1 text-xs shadow">
            {m.reaction}
          </span>
        )}
      </div>
      {!out && reactBtn}
      {!out && replyBtn}
    </div>
  );
}
