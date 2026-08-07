"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Send,
  Loader2,
  Phone,
  ExternalLink,
  Paperclip,
  FileText,
  Download,
  X,
  Mic,
  Check,
  CheckCheck,
  SmilePlus,
  ArrowRightLeft,
  Plus,
  Trash2,
  Trophy,
  Ban,
  Zap,
  StickyNote,
  CalendarPlus,
  CalendarDays,
  Clock,
  Search,
  ChevronDown,
  ChevronLeft,
  Reply,
  Pencil,
  EyeOff,
  Sparkles,
  ImagePlus,
  Camera,
  RefreshCw,
  History,
  Headset,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { formatPhone, currencyBRL } from "@/lib/utils";
import { fmtTimeBR, fmtDateBR, relativeDayBR, ymdBR, hourBR } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";
import { useRole } from "@/components/role-context";
import { can } from "@/lib/permissions";
import {
  TaskTypeBadge,
  TaskTypeSelect,
  DEFAULT_TASK_TYPE,
} from "@/components/crm/task-type";
import {
  sendWhatsappMessage,
  sendWhatsappMedia,
  reactToMessage,
  markConversationRead,
  markConversationUnread,
  deleteMessageForAll,
  editWhatsappMessage,
  typingPresence,
  createQuickReply,
  deleteQuickReply,
  scheduleMessage,
  cancelScheduledMessage,
  fetchLeadHistory,
} from "@/app/(dashboard)/crm/whatsapp-actions";
import { suggestReply } from "@/app/(dashboard)/crm/ai-actions";
import {
  updateLead,
  transferLead,
  addTag,
  removeTag,
  createTask,
  toggleTask,
  addNote,
  createMeeting,
  deleteMeeting,
  addLeadToPipeline,
} from "@/app/(dashboard)/crm/actions";
import {
  SOURCE_LABEL,
  type WhatsappMessage,
  type Lead,
  type LeadTag,
  type LeadNote,
  type LeadTask,
  type Meeting,
  type PipelineStage,
  type Profile,
  type QuickReply,
  type ScheduledMessage,
  type TaskCategory,
  SECTOR,
  type Sector,
} from "@/lib/types";

export type LeadContext = {
  lead: Lead & { tags: LeadTag[]; owner: Profile | null };
  stages: PipelineStage[];
  team: Profile[];
  tasks: (LeadTask & { assignee?: { name: string } })[];
  notes: (LeadNote & { author?: { name: string } })[];
  meetings: Meeting[];
  scheduled: ScheduledMessage[];
};

export type ChatMessage = WhatsappMessage;

function hhmm(iso: string) {
  return fmtTimeBR(iso);
}

/**
 * Comprime a imagem no navegador antes do upload (máx 1600px no maior lado,
 * JPEG ~82%). Só troca pelo comprimido se ficar MENOR que o original; GIF e
 * qualquer falha caem no arquivo original sem quebrar o envio.
 */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const MAX = 1600;
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82)
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } catch {
    return file;
  }
}

/**
 * A bolha otimista guarda o texto SEM assinatura; a mensagem real pode chegar
 * com "*Setor - Nome*\n" na frente. Considera casada se for igual OU se a
 * real terminar com o texto pendente.
 */
function matchesSent(real: string | null, pending: string | null): boolean {
  if (!real || !pending) return false;
  return real === pending || real.endsWith(`\n${pending}`);
}

// (O antigo InboxView de página inteira foi removido: a mensageria vive no
// ChatWorkspace do OPS Chat, que reusa o ChatPanel e o LeadPanel abaixo.)

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
  lead: {
    id: string;
    name: string;
    phone: string | null;
    avatar_url: string | null;
  };
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
  const router = useRouter();

  // atendimento / sync / histórico (barra do topo)
  const [starting, setStarting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [histLoading, setHistLoading] = useState(false);
  const [histEvents, setHistEvents] = useState<
    { id: string; at: string; text: string; by: string | null }[]
  >([]);

  async function startService() {
    if (!currentUserId || starting) return;
    setStarting(true);
    await updateLead(lead.id, { owner_id: currentUserId });
    setStarting(false);
    router.refresh();
    await onOwnerChanged?.();
  }

  const [addingPipe, setAddingPipe] = useState(false);
  async function addToPipeline() {
    if (addingPipe) return;
    setAddingPipe(true);
    await addLeadToPipeline(lead.id);
    setAddingPipe(false);
    router.refresh();
    await onOwnerChanged?.();
  }

  async function doSync() {
    if (syncing) return;
    setSyncing(true);
    if (onSync) await onSync();
    else router.refresh();
    setTimeout(() => setSyncing(false), 600);
  }

  async function openHistory() {
    setHistOpen((o) => !o);
    if (histOpen) return;
    setHistLoading(true);
    const r = await fetchLeadHistory(lead.id);
    setHistLoading(false);
    if ("events" in r) setHistEvents(r.events);
  }
  const supabase = useMemo(() => createClient(), []);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrQuery, setQrQuery] = useState("");
  const [schedOpen, setSchedOpen] = useState(false);
  const [schedWhen, setSchedWhen] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

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

  // ---- Mensagens ao vivo: estado local + realtime cirúrgico ----
  // A página manda o histórico; INSERT/UPDATE do lead chegam via realtime e
  // são aplicados direto no estado (sem re-renderizar a página inteira).
  const [msgs, setMsgs] = useState<ChatMessage[]>(messages);
  const [pendingMsgs, setPendingMsgs] = useState<ChatMessage[]>([]);
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
  }, [messages, lead.id]);

  useEffect(() => {
    const channel = supabase
      .channel(`wa-chat-${lead.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_messages",
          filter: `lead_id=eq.${lead.id}`,
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
          filter: `lead_id=eq.${lead.id}`,
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

    // presença em canal PRÓPRIO (assinaturas múltiplas num canal se perdem)
    const presenceChannel = supabase
      .channel(`wa-chat-presence-${lead.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_presence",
          filter: `lead_id=eq.${lead.id}`,
        },
        (payload) => {
          const st = (payload.new as { state?: string } | null)?.state;
          if (st === "composing") {
            setContactTyping(true);
            if (typingHideTimer.current) clearTimeout(typingHideTimer.current);
            typingHideTimer.current = setTimeout(
              () => setContactTyping(false),
              8000
            );
          } else {
            setContactTyping(false);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(presenceChannel);
    };
  }, [supabase, lead.id]);

  const allMsgs = useMemo(
    () => [...msgs, ...pendingMsgs],
    [msgs, pendingMsgs]
  );

  // Divisor "Não lidas": congela a primeira não-lida de quando a conversa abriu
  const firstUnreadRef = useRef<{ lead: string; id: string | null }>({
    lead: "",
    id: null,
  });
  if (firstUnreadRef.current.lead !== lead.id) {
    firstUnreadRef.current = {
      lead: lead.id,
      id:
        messages.find((m) => m.direction === "in" && !m.read_at)?.id ?? null,
    };
  }
  const firstUnreadId = firstUnreadRef.current.id;

  // ---- Scroll: abre no fim, acompanha mensagem nova, botão de voltar ----
  const scrollRef = useRef<HTMLDivElement>(null);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const nearBottom = () => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 240;
  };
  const scrollToBottom = (smooth = false) => {
    const el = scrollRef.current;
    if (el)
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };
  useEffect(() => {
    scrollToBottom(false); // trocar de conversa → direto no fim
  }, [lead.id]);
  const lastLenRef = useRef(allMsgs.length);
  useEffect(() => {
    if (allMsgs.length > lastLenRef.current && nearBottom()) {
      scrollToBottom(true);
    }
    lastLenRef.current = allMsgs.length;
  }, [allMsgs.length]);

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
  // Anexo estilo WhatsApp: o clipe abre um MENU (fotos/vídeos, documento,
  // câmera) e cada opção dispara o seletor certo.
  const photoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [mediaCaption, setMediaCaption] = useState("");
  const previewUrl = useMemo(
    () =>
      pendingFile && pendingFile.type.startsWith("image/")
        ? URL.createObjectURL(pendingFile)
        : null,
    [pendingFile]
  );

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
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("leadId", lead.id);
    // foto de celular (~4MB) vira JPEG ~300KB antes de subir
    fd.append("file", await compressImage(pendingFile));
    if (mediaCaption.trim()) fd.append("caption", mediaCaption.trim());
    const r = await sendWhatsappMedia(fd);
    setUploading(false);
    if (r?.error) {
      setError(r.error);
      return;
    }
    setPendingFile(null);
    setMediaCaption("");
    router.refresh();
  }

  // Gravação de áudio
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recorderRef = useRef<any>(null);
  const cancelRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function startRec() {
    try {
      const { default: Recorder } = await import("opus-recorder");
      const rec = new Recorder({
        encoderPath:
          "https://cdn.jsdelivr.net/npm/opus-recorder@8.0.5/dist/encoderWorker.min.js",
        encoderApplication: 2048, // VOIP
        encoderSampleRate: 16000, // WhatsApp voice note = 16kHz mono
        numberOfChannels: 1,
        streamPages: false,
      });
      cancelRef.current = false;
      rec.ondataavailable = async (typedArray: BlobPart) => {
        if (cancelRef.current) return;
        const blob = new Blob([typedArray], { type: "audio/ogg" });
        if (!blob.size) return;
        const file = new File([blob], "audio.ogg", { type: "audio/ogg" });
        setUploading(true);
        setError(null);
        const fd = new FormData();
        fd.append("leadId", lead.id);
        fd.append("file", file);
        const r = await sendWhatsappMedia(fd);
        setUploading(false);
        if (r?.error) setError(r.error);
        else router.refresh();
      };
      await rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setRecSec(0);
      timerRef.current = setInterval(() => setRecSec((s) => s + 1), 1000);
    } catch {
      setError("Não consegui acessar o microfone (permita o acesso).");
    }
  }
  function stopRec(sendIt: boolean) {
    cancelRef.current = !sendIt;
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    setRecSec(0);
    recorderRef.current?.stop();
  }
  const recMMSS = `${String(Math.floor(recSec / 60)).padStart(2, "0")}:${String(
    recSec % 60
  ).padStart(2, "0")}`;

  // Se o painel desmontar (trocar de lead, fechar o dock) no meio de uma
  // gravação, o interval e o microfone precisam ser liberados mesmo sem
  // stopRec() ter rodado — senão o setInterval segue vivo chamando
  // setRecSec num componente já desmontado, e o microfone fica preso.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recorderRef.current) {
        cancelRef.current = true; // não manda áudio de um componente que já foi
        recorderRef.current.stop();
      }
    };
  }, []);

  // Responder mensagem (citação estilo WhatsApp)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  useEffect(() => setReplyTo(null), [lead.id]);

  // "digitando…" do CONTATO (chat_presence via realtime; some após 8s)
  const [contactTyping, setContactTyping] = useState(false);
  const typingHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setContactTyping(false);
    return () => {
      if (typingHideTimer.current) clearTimeout(typingHideTimer.current);
    };
  }, [lead.id]);

  // Fallback do "digitando…": polling leve (1 linha a cada 4s) — garante o
  // indicador mesmo se o realtime piscar. O banco é a fonte da verdade.
  useEffect(() => {
    const iv = setInterval(async () => {
      const { data } = await supabase
        .from("chat_presence")
        .select("state, at")
        .eq("lead_id", lead.id)
        .maybeSingle();
      const row = data as { state?: string; at?: string } | null;
      const fresh =
        !!row?.at && Date.now() - new Date(row.at).getTime() < 8000;
      if (row?.state === "composing" && fresh) setContactTyping(true);
    }, 4000);
    return () => clearInterval(iv);
  }, [supabase, lead.id]);

  // balão "digitando" apareceu → acompanha, se você já estava no fim
  useEffect(() => {
    if (contactTyping && nearBottom()) scrollToBottom(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactTyping]);

  // "digitando…" NOSSO pro contato (debounced: composing ao digitar,
  // paused após 4s parado ou ao enviar)
  const typingRef = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function pingTyping() {
    if (!lead.phone) return;
    if (!typingRef.current) {
      typingRef.current = true;
      void typingPresence(lead.id, "composing");
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      typingRef.current = false;
      void typingPresence(lead.id, "paused");
    }, 4000);
  }
  function stopTyping() {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (typingRef.current) {
      typingRef.current = false;
      void typingPresence(lead.id, "paused");
    }
  }
  useEffect(() => () => stopTyping(), [lead.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send() {
    const body = text.trim();
    // guard de duplo Enter: um envio por vez
    if (!body || sending || !lead.phone) return;
    setSending(true);
    setError(null);
    const quoted = replyTo;
    const quotedSnippet = quoted
      ? (quoted.body ?? (quoted.media_type ? "[mídia]" : "")).slice(0, 180)
      : null;
    // otimista: a bolha aparece NA HORA com status "enviando"
    const tmp: ChatMessage = {
      id: `tmp-${Date.now()}`,
      lead_id: lead.id,
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
    setText("");
    setReplyTo(null);
    stopTyping();
    setTimeout(() => scrollToBottom(true), 30);

    const r = await sendWhatsappMessage(
      lead.id,
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
      setText(body); // devolve o texto pra caixa pra não perder nada
      setReplyTo(quoted);
      setError(r.error);
      return;
    }
    router.refresh();
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
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-2.5 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {onBack && (
            <button
              onClick={onBack}
              aria-label="Voltar pra lista de conversas"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] sm:hidden"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <Avatar name={lead.name} src={lead.avatar_url} size={36} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium">{lead.name}</p>
              {/* status de atendimento (dono da conversa) */}
              {owner !== undefined &&
                (owner ? (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-success)]/12 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-success)]">
                    <Headset className="h-3 w-3" />
                    <span className="hidden sm:inline">Em atendimento&nbsp;·&nbsp;</span>
                    {owner.id === currentUserId
                      ? "você"
                      : owner.name.split(" ")[0]}
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-warning)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-warning)]">
                    <span className="sm:hidden">Aguardando</span>
                    <span className="hidden sm:inline">
                      Aguardando atendimento
                    </span>
                  </span>
                ))}
            </div>
            {contactTyping ? (
              <p className="text-xs font-medium italic text-[var(--color-success)]">
                digitando…
              </p>
            ) : (
              lead.phone && (
                <p className="hidden items-center gap-1 text-xs text-[var(--color-muted)] sm:flex">
                  <Phone className="h-3 w-3" />
                  {formatPhone(lead.phone)}
                </p>
              )
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {inPipeline === false && (
            <button
              onClick={addToPipeline}
              disabled={addingPipe}
              className="mr-1 flex h-8 items-center gap-1.5 rounded-lg border border-[var(--color-primary)]/40 px-2 text-xs font-semibold text-[var(--color-primary)] transition hover:bg-[var(--color-primary)]/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] sm:px-3"
              title="Criar o card deste contato no funil de vendas"
              aria-label="Adicionar ao funil"
            >
              {addingPipe ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Adicionar ao funil</span>
            </button>
          )}
          {owner === null && currentUserId && (
            <button
              onClick={startService}
              disabled={starting}
              className="mr-1 flex h-8 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-2 text-xs font-semibold text-[var(--color-primary-foreground)] transition hover:bg-[var(--color-primary-hover)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] sm:px-3"
              title="Iniciar atendimento"
              aria-label="Iniciar atendimento"
            >
              {starting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Headset className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Iniciar atendimento</span>
              <span className="sm:hidden">Atender</span>
            </button>
          )}
          <button
            onClick={async () => {
              await markConversationUnread(lead.id);
              router.refresh();
            }}
            className="hidden h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted-2)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] sm:flex"
            title="Marcar como não lida"
            aria-label="Marcar como não lida"
          >
            <EyeOff className="h-4 w-4" />
          </button>
          <button
            onClick={doSync}
            className="hidden h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted-2)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] sm:flex"
            title="Sincronizar mensagens"
            aria-label="Sincronizar mensagens"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          </button>
          <div className="relative hidden sm:block">
            <button
              onClick={openHistory}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
                histOpen
                  ? "bg-[var(--color-surface-2)] text-[var(--color-foreground)]"
                  : "text-[var(--color-muted-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
              }`}
              title="Histórico de movimentação"
              aria-label="Histórico de movimentação"
            >
              <History className="h-4 w-4" />
            </button>
            {histOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setHistOpen(false)}
                />
                <div className="absolute right-0 top-10 z-20 w-80 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-2 shadow-xl">
                  <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-2)]">
                    Histórico de movimentação
                  </p>
                  <div className="max-h-72 space-y-0.5 overflow-y-auto">
                    {histLoading && (
                      <div className="flex justify-center py-6">
                        <Loader2 className="h-4 w-4 animate-spin text-[var(--color-muted)]" />
                      </div>
                    )}
                    {!histLoading && histEvents.length === 0 && (
                      <p className="px-2 py-4 text-xs text-[var(--color-muted-2)]">
                        Nenhuma movimentação registrada ainda — as trocas de
                        etapa e transferências vão aparecer aqui.
                      </p>
                    )}
                    {histEvents.map((e) => (
                      <div
                        key={e.id}
                        className="rounded-lg px-2 py-1.5 hover:bg-[var(--color-surface-2)]"
                      >
                        <p className="text-xs">{e.text}</p>
                        <p className="text-[11px] text-[var(--color-muted-2)]">
                          {fmtDateBR(e.at)} {fmtTimeBR(e.at)}
                          {e.by ? ` · por ${e.by}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <Link
            href={`/crm/leads/${lead.id}`}
            className="hidden h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted-2)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] sm:flex"
            title="Abrir página do lead"
            aria-label="Abrir página do lead"
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
          {onDelete && (
            <button
              onClick={onDelete}
              className="hidden h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted-2)] transition hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] sm:flex"
              title="Excluir conversa"
              aria-label="Excluir conversa"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          onScroll={() => setAwayFromBottom(!nearBottom())}
          className="h-full space-y-2 overflow-y-auto bg-[var(--color-background)] p-3 sm:p-5"
        >
          {allMsgs.length === 0 && (
            <p className="py-10 text-center text-sm text-[var(--color-muted-2)]">
              Nenhuma mensagem. Envie a primeira abaixo.
            </p>
          )}
          {allMsgs.map((m, i) => {
            const prev = allMsgs[i - 1];
            const newDay =
              !prev || ymdBR(prev.created_at) !== ymdBR(m.created_at);
            return (
              <div key={m.id} className="space-y-2">
                {newDay && (
                  <div className="flex justify-center py-1.5">
                    <span className="rounded-full bg-[var(--color-surface-2)] px-3 py-1 text-[11px] font-medium capitalize text-[var(--color-muted)] shadow-sm">
                      {relativeDayBR(m.created_at)}
                    </span>
                  </div>
                )}
                {m.id === firstUnreadId && (
                  <div className="flex items-center gap-2 py-1">
                    <span className="h-px flex-1 bg-[var(--color-success)]/40" />
                    <span className="text-[11px] font-medium text-[var(--color-success)]">
                      Mensagens não lidas
                    </span>
                    <span className="h-px flex-1 bg-[var(--color-success)]/40" />
                  </div>
                )}
                <MessageBubble
                  m={m}
                  leadId={lead.id}
                  leadName={lead.name}
                  onReply={(msg) => setReplyTo(msg)}
                />
              </div>
            );
          })}

          {/* balão "digitando" com os 3 pontinhos, estilo app de mensagem */}
          {contactTyping && (
            <div className="flex justify-start">
              <div className="card flex items-center gap-1.5 rounded-2xl px-4 py-3.5">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          )}
        </div>
        {awayFromBottom && (
          <button
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-muted)] shadow-lg transition hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            aria-label="Ir para o fim"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        )}
      </div>

      {!connected && (
        <div className="bg-[var(--color-danger)]/10 px-5 py-2 text-center text-xs text-[var(--color-danger)]">
          WhatsApp desconectado — conecte em Configurações → WhatsApp para enviar.
        </div>
      )}

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
                Respondendo{" "}
                {replyTo.direction === "out" ? "você" : lead.name}
              </p>
              <p className="line-clamp-2 break-words text-xs text-[var(--color-muted)]">
                {replyTo.body ??
                  (replyTo.media_type ? "[mídia]" : "")}
              </p>
            </div>
            <button
              onClick={() => setReplyTo(null)}
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
        {recording ? (
          <div className="flex h-10 items-center gap-3 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--color-danger)]" />
            <span className="text-sm">Gravando áudio… {recMMSS}</span>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => stopRec(false)}
                className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                aria-label="Cancelar"
                title="Cancelar"
              >
                <X className="h-4 w-4" />
              </button>
              <button
                onClick={() => stopRec(true)}
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
            <div className="relative">
              <button
                onClick={() => setAttachOpen((o) => !o)}
                disabled={uploading || !lead.phone}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border-strong)] transition disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
                  attachOpen
                    ? "bg-[var(--color-surface-2)] text-[var(--color-foreground)]"
                    : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
                }`}
                aria-label="Anexar"
                title="Anexar"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Paperclip
                    className={`h-4 w-4 transition-transform ${
                      attachOpen ? "rotate-45" : ""
                    }`}
                  />
                )}
              </button>
              {attachOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setAttachOpen(false)}
                  />
                  <div className="absolute bottom-12 left-0 z-20 w-52 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-1.5 shadow-xl">
                    {(
                      [
                        {
                          label: "Fotos e vídeos",
                          icon: ImagePlus,
                          color: "#1d6fff",
                          ref: photoRef,
                        },
                        {
                          label: "Documento",
                          icon: FileText,
                          color: "#a78bfa",
                          ref: docRef,
                        },
                        {
                          label: "Câmera",
                          icon: Camera,
                          color: "#f472b6",
                          ref: camRef,
                        },
                      ] as const
                    ).map((opt) => {
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.label}
                          onClick={() => {
                            setAttachOpen(false);
                            opt.ref.current?.click();
                          }}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                        >
                          <span
                            className="flex h-8 w-8 items-center justify-center rounded-full"
                            style={{ backgroundColor: `${opt.color}1c` }}
                          >
                            <Icon
                              className="h-4 w-4"
                              style={{ color: opt.color }}
                            />
                          </span>
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            <div className="relative hidden sm:block">
              <button
                onClick={() => setSchedOpen((o) => !o)}
                disabled={!lead.phone}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border-strong)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                aria-label="Agendar envio"
                title="Agendar mensagem (enviar depois)"
              >
                <Clock className="h-4 w-4" />
              </button>
              {schedOpen && (
                <div className="absolute bottom-12 left-0 z-30 w-64 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-lg">
                  <p className="mb-2 flex items-center gap-1 text-xs font-medium text-[var(--color-muted)]">
                    <Clock className="h-3.5 w-3.5" /> Agendar para
                  </p>
                  <div className="mb-2 flex flex-wrap gap-1">
                    {(
                      [
                        {
                          label: "Em 1h",
                          get: () => new Date(Date.now() + 3600_000),
                        },
                        {
                          label: "Hoje 18h",
                          get: () => {
                            const d = new Date();
                            d.setHours(18, 0, 0, 0);
                            return d;
                          },
                        },
                        {
                          label: "Amanhã 9h",
                          get: () => {
                            const d = new Date(Date.now() + 86400_000);
                            d.setHours(9, 0, 0, 0);
                            return d;
                          },
                        },
                      ] as const
                    ).map((p) => (
                      <button
                        key={p.label}
                        onClick={() => {
                          const d = p.get();
                          const pad = (n: number) => String(n).padStart(2, "0");
                          setSchedWhen(
                            `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
                              d.getDate()
                            )}T${pad(d.getHours())}:${pad(d.getMinutes())}`
                          );
                        }}
                        className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-muted)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <Input
                    type="datetime-local"
                    value={schedWhen}
                    onChange={(e) => setSchedWhen(e.target.value)}
                    className="mb-2 h-9 text-xs"
                  />
                  {!text.trim() && (
                    <p className="mb-2 text-[11px] text-[var(--color-muted-2)]">
                      Digite a mensagem na caixa antes de agendar.
                    </p>
                  )}
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={scheduling || !schedWhen || !text.trim()}
                    onClick={doSchedule}
                  >
                    {scheduling ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Agendar mensagem"
                    )}
                  </Button>
                </div>
              )}
            </div>
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
                onClick={startRec}
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !uploading && setPendingFile(null)}
        >
          <div
            className="card w-full max-w-md p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">Enviar arquivo</span>
              <button
                onClick={() => setPendingFile(null)}
                disabled={uploading}
                aria-label="Cancelar envio de arquivo"
                className="flex min-h-9 min-w-9 items-center justify-center"
              >
                <X className="h-5 w-5 text-[var(--color-muted)]" />
              </button>
            </div>
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Pré-visualização do arquivo selecionado"
                loading="lazy"
                className="mb-3 max-h-72 w-full rounded-lg bg-[var(--color-surface-2)] object-contain"
              />
            ) : (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-[var(--color-surface-2)] p-3 text-sm">
                <FileText className="h-5 w-5 shrink-0 text-[var(--color-muted)]" />
                <span className="truncate">{pendingFile.name}</span>
              </div>
            )}
            <div className="flex items-end gap-2">
              <input
                value={mediaCaption}
                onChange={(e) => setMediaCaption(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    sendPending();
                  }
                }}
                placeholder="Legenda (opcional)"
                autoFocus
                className="h-10 flex-1 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
              <button
                onClick={sendPending}
                disabled={uploading}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
                aria-label="Enviar"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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

function MessageBubble({
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
        {m.media_url &&
          m.media_type === "document" &&
          (() => {
            // cartão de documento estilo WhatsApp: nome, selo do tipo e baixar
            const rawName = decodeURIComponent(
              m.media_url.split("?")[0].split("/").pop() ?? "documento"
            );
            const isPdf = /\.pdf$/i.test(rawName);
            const ext = rawName.includes(".")
              ? rawName.split(".").pop()!.toUpperCase()
              : "ARQUIVO";
            // Supabase Storage: ?download=nome força o Content-Disposition
            const downloadUrl = `${m.media_url}${
              m.media_url.includes("?") ? "&" : "?"
            }download=${encodeURIComponent(rawName)}`;
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
                  <p className="truncate text-[13px] font-medium leading-tight">
                    {rawName}
                  </p>
                  <p
                    className={`text-[11px] font-semibold uppercase tracking-wide ${
                      out ? "text-[var(--color-primary-foreground)]/70" : "text-[var(--color-muted-2)]"
                    }`}
                  >
                    {isPdf ? "PDF" : ext}
                  </p>
                </div>
                <a
                  href={m.media_url}
                  target="_blank"
                  rel="noreferrer"
                  title="Abrir"
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${
                    out
                      ? "text-[var(--color-primary-foreground)]/80 hover:bg-[color-mix(in_srgb,var(--color-primary-foreground)_15%,transparent)] hover:text-[var(--color-primary-foreground)]"
                      : "text-[var(--color-muted)] hover:bg-[var(--color-border)]/60 hover:text-[var(--color-primary)]"
                  }`}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
                <a
                  href={downloadUrl}
                  title="Baixar"
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${
                    out
                      ? "text-[var(--color-primary-foreground)]/80 hover:bg-[color-mix(in_srgb,var(--color-primary-foreground)_15%,transparent)] hover:text-[var(--color-primary-foreground)]"
                      : "text-[var(--color-muted)] hover:bg-[var(--color-border)]/60 hover:text-[var(--color-primary)]"
                  }`}
                >
                  <Download className="h-4 w-4" />
                </a>
              </div>
            );
          })()}
        {m.body && (
          <p className="whitespace-pre-wrap break-words">{renderWaText(m.body)}</p>
        )}
        <div
          className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${
            out ? "text-[var(--color-primary-foreground)]/70" : "text-[var(--color-muted-2)]"
          }`}
        >
          {hhmm(m.created_at)}
          {out &&
            m.status !== "failed" &&
            (m.status === "sending" ? (
              <span className="flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
              </span>
            ) : m.status === "read" ? (
              <span className="flex items-center gap-0.5 text-[var(--color-primary-foreground)]">
                lido <CheckCheck className="h-3.5 w-3.5" />
              </span>
            ) : m.status === "delivered" ? (
              <span className="flex items-center gap-0.5">
                entregue <CheckCheck className="h-3.5 w-3.5" />
              </span>
            ) : (
              <span className="flex items-center gap-0.5">
                enviado <Check className="h-3.5 w-3.5" />
              </span>
            ))}
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

function QuickReplyPicker({
  quickReplies,
  onPick,
  onClose,
  query = "",
  onQuery,
}: {
  quickReplies: QuickReply[];
  onPick: (content: string) => void;
  onClose: () => void;
  query?: string;
  onQuery?: (q: string) => void;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [shortcut, setShortcut] = useState("");
  const [content, setContent] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = q
    ? quickReplies.filter((r) =>
        `${r.title} ${r.shortcut ?? ""} ${r.content}`.toLowerCase().includes(q)
      )
    : quickReplies;

  async function add() {
    if (!title.trim() || !content.trim()) return;
    await createQuickReply({
      title,
      content,
      shortcut: shortcut.trim() || undefined,
    });
    setTitle("");
    setShortcut("");
    setContent("");
    setAdding(false);
    router.refresh();
  }

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute bottom-12 left-0 z-20 w-72 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-2 shadow-xl">
        <div className="mb-1 flex items-center justify-between px-1">
          <span className="text-xs font-semibold">Respostas rápidas</span>
          <button
            onClick={() => setAdding((a) => !a)}
            className="text-xs text-[var(--color-primary)]"
          >
            {adding ? "Cancelar" : "+ Nova"}
          </button>
        </div>
        <div className="mb-1.5 flex h-8 items-center gap-1.5 rounded-lg bg-[var(--color-surface-2)] px-2">
          <Search className="h-3 w-3 text-[var(--color-muted-2)]" />
          <input
            value={query}
            onChange={(e) => onQuery?.(e.target.value)}
            placeholder="Buscar (ou digite / na mensagem)"
            className="w-full bg-transparent text-xs outline-none placeholder:text-[var(--color-muted-2)]"
            autoFocus={!query}
          />
        </div>
        {adding && (
          <div className="mb-2 space-y-1.5 rounded-lg bg-[var(--color-surface-2)] p-2">
            <div className="flex gap-1.5">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título"
                className="h-8 flex-1 text-xs"
              />
              <Input
                value={shortcut}
                onChange={(e) => setShortcut(e.target.value)}
                placeholder="/atalho"
                className="h-8 w-20 text-xs"
              />
            </div>
            <Textarea
              rows={2}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Mensagem (use {nome}, {saudacao}, {meu_nome})"
            />
            <Button size="sm" className="w-full" onClick={add}>
              Salvar template
            </Button>
          </div>
        )}
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="px-1 text-xs text-[var(--color-muted-2)]">
              {q ? "Nada encontrado." : "Nenhuma resposta rápida."}
            </p>
          )}
          {filtered.map((q) => (
            <div
              key={q.id}
              className="group flex items-start gap-1 rounded-lg px-2 py-1.5 hover:bg-[var(--color-surface-2)]"
            >
              <button
                onClick={() => onPick(q.content)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="truncate">{q.title}</span>
                  {q.shortcut && (
                    <span className="shrink-0 rounded bg-[var(--color-primary)]/10 px-1 font-mono text-[11px] text-[var(--color-primary)]">
                      /{q.shortcut.replace(/^\//, "")}
                    </span>
                  )}
                </p>
                <p className="truncate text-[11px] text-[var(--color-muted)]">
                  {q.content}
                </p>
              </button>
              <button
                onClick={async () => {
                  await deleteQuickReply(q.id);
                  router.refresh();
                }}
                className="text-[var(--color-muted-2)] opacity-0 transition hover:text-[var(--color-danger)] group-hover:opacity-100"
                aria-label="Excluir"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

const TAG_PALETTE = ["#1d6fff", "#00d4ff", "#00e5a0", "#fbbf24", "#ff5c5c", "#f472b6"];

export function LeadPanel({
  context,
  currentUserId,
  onChanged,
  hideStage = false,
}: {
  context: LeadContext;
  currentUserId: string;
  /** Chamado após cada mutação (o dock usa pra re-buscar o contexto). */
  onChanged?: () => void | Promise<void>;
  /** No chat flutuante a etapa não aparece (gestão de funil fica no kanban). */
  hideStage?: boolean;
}) {
  const router = useRouter();
  const role = useRole();
  const { lead, stages, team, tasks, notes, meetings, scheduled } = context;
  const wonStage = stages.find((s) => s.is_won);
  const lostStage = stages.find((s) => s.is_lost);
  const [busy, setBusy] = useState(false);
  const [val, setVal] = useState(String(lead.value ?? 0));
  const [newTag, setNewTag] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskType, setTaskType] = useState<TaskCategory>(DEFAULT_TASK_TYPE);
  const [note, setNote] = useState("");
  const [meetTitle, setMeetTitle] = useState("");
  const [meetWhen, setMeetWhen] = useState("");

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    await fn();
    setBusy(false);
    router.refresh();
    await onChanged?.();
  }

  const openTasks = tasks.filter((t) => !t.done);

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="space-y-4 p-4">
        {/* Cabeçalho */}
        <div className="flex items-center gap-3">
          <Avatar name={lead.name} src={lead.avatar_url} size={42} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{lead.name}</p>
            <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--color-muted)]">
              {SOURCE_LABEL[lead.source]}
            </span>
          </div>
          <Link
            href={`/crm/leads/${lead.id}`}
            className="ml-auto text-[var(--color-muted)] hover:text-[var(--color-primary)]"
            title="Abrir lead"
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>

        {/* Fora do funil: card é opcional — adiciona quando quiser */}
        {!lead.pipeline_id && (
          <div className="rounded-lg border border-[#f59e0b]/30 bg-[#f59e0b]/8 p-3">
            <p className="text-xs text-[var(--color-muted)]">
              Este contato está <b>só no chat</b> — ainda não tem card no funil.
            </p>
            <button
              disabled={busy}
              onClick={() => run(() => addLeadToPipeline(lead.id))}
              className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--color-primary)] text-xs font-semibold text-[var(--color-primary-foreground)] transition hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar ao funil
            </button>
          </div>
        )}

        {/* Etapa */}
        <div className={hideStage || !lead.pipeline_id ? "hidden" : undefined}>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted-2)]">
            Etapa
          </label>
          <select
            value={lead.stage_id ?? ""}
            disabled={busy}
            onChange={(e) => run(() => updateLead(lead.id, { stage_id: e.target.value }))}
            className="h-9 w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 text-sm"
          >
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="mt-2 flex gap-2">
            {wonStage && (
              <button
                disabled={busy}
                onClick={() => run(() => updateLead(lead.id, { stage_id: wonStage.id }))}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[var(--color-success)]/15 py-1.5 text-xs font-medium text-[var(--color-success)] hover:bg-[var(--color-success)]/25"
              >
                <Trophy className="h-3.5 w-3.5" /> Ganho
              </button>
            )}
            {lostStage && (
              <button
                disabled={busy}
                onClick={() => run(() => updateLead(lead.id, { stage_id: lostStage.id }))}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[var(--color-danger)]/10 py-1.5 text-xs font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger)]/20"
              >
                <Ban className="h-3.5 w-3.5" /> Perdido
              </button>
            )}
          </div>
        </div>

        {/* Responsável (transferir) */}
        {can.transferLead(role) && (
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted-2)]">
              Responsável
            </label>
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 shrink-0 text-[var(--color-muted)]" />
              <select
                value={lead.owner_id ?? ""}
                disabled={busy}
                onChange={(e) =>
                  run(() => transferLead(lead.id, e.target.value, ""))
                }
                className="h-9 w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 text-sm"
              >
                <option value="">Sem responsável</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id === currentUserId ? `${m.name} (eu)` : m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Setor */}
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted-2)]">
            Setor
          </label>
          {role === "admin" ? (
            <select
              value={lead.sector}
              disabled={busy}
              onChange={(e) =>
                run(() => updateLead(lead.id, { sector: e.target.value as Sector }))
              }
              className="h-9 w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 text-sm"
            >
              {(Object.keys(SECTOR) as Sector[]).map((s) => (
                <option key={s} value={s}>
                  {SECTOR[s].label}
                </option>
              ))}
            </select>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: `${SECTOR[lead.sector].color}22`,
                color: SECTOR[lead.sector].color,
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: SECTOR[lead.sector].color }}
              />
              {SECTOR[lead.sector].label}
            </span>
          )}
        </div>

        {/* Valor */}
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted-2)]">
            Valor ({currencyBRL(lead.value || 0)})
          </label>
          <div className="flex gap-2">
            <Input
              type="number"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              className="h-9 text-sm"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => run(() => updateLead(lead.id, { value: Number(val) || 0 }))}
            >
              Salvar
            </Button>
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted-2)]">
            Tags
          </label>
          <div className="mb-2 flex flex-wrap gap-1">
            {lead.tags.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium"
                style={{ backgroundColor: `${t.color}22`, color: t.color }}
              >
                {t.tag}
                <button
                  onClick={() => run(() => removeTag(t.id, lead.id))}
                  aria-label={`Remover tag ${t.tag}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-1.5">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Nova tag"
              className="h-8 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTag.trim()) {
                  const color = TAG_PALETTE[lead.tags.length % TAG_PALETTE.length];
                  run(() => addTag(lead.id, newTag.trim(), color));
                  setNewTag("");
                }
              }}
            />
          </div>
        </div>

        {/* Tarefas */}
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted-2)]">
            Tarefas {openTasks.length > 0 && `(${openTasks.length})`}
          </label>
          <div className="mb-2 space-y-1.5">
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-sm">
                <button
                  onClick={() => run(() => toggleTask(t.id, lead.id, !t.done))}
                  aria-label={t.done ? "Marcar tarefa como pendente" : "Marcar tarefa como concluída"}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    t.done
                      ? "border-[var(--color-success)] bg-[var(--color-success)] text-[var(--color-primary-foreground)]"
                      : "border-[var(--color-border-strong)]"
                  }`}
                >
                  {t.done && <Check className="h-3 w-3" />}
                </button>
                <span className={`min-w-0 flex-1 truncate text-xs ${t.done ? "text-[var(--color-muted-2)] line-through" : ""}`}>
                  {t.title}
                </span>
                <TaskTypeBadge value={t.category} />
              </div>
            ))}
          </div>
          <div className="flex gap-1.5">
            <TaskTypeSelect value={taskType} onChange={setTaskType} className="h-8 w-28 shrink-0" />
            <Input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Nova tarefa (Enter)"
              className="h-8 flex-1 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter" && taskTitle.trim()) {
                  run(() =>
                    createTask({
                      leadId: lead.id,
                      title: taskTitle.trim(),
                      category: taskType,
                      assigneeId: currentUserId,
                    })
                  );
                  setTaskTitle("");
                }
              }}
            />
          </div>
        </div>

        {/* Agendamentos */}
        <div>
          <label className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted-2)]">
            <CalendarDays className="h-3 w-3" /> Agendamentos
          </label>
          <div className="mb-2 space-y-1.5">
            {meetings.length === 0 && (
              <p className="text-xs text-[var(--color-muted-2)]">
                Nenhuma reunião agendada.
              </p>
            )}
            {meetings.map((mt) => {
              const past = new Date(mt.starts_at).getTime() < Date.now();
              return (
                <div
                  key={mt.id}
                  className="flex items-center gap-2 rounded-lg bg-[var(--color-surface-2)] px-2.5 py-2"
                >
                  <CalendarDays
                    className={`h-4 w-4 shrink-0 ${
                      past ? "text-[var(--color-muted-2)]" : "text-[var(--color-primary)]"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{mt.title}</p>
                    <p className="text-[11px] text-[var(--color-muted)]">
                      {new Date(mt.starts_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <button
                    onClick={() => run(() => deleteMeeting(mt.id))}
                    className="text-[var(--color-muted-2)] hover:text-[var(--color-danger)]"
                    aria-label="Excluir agendamento"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="space-y-1.5">
            <Input
              value={meetTitle}
              onChange={(e) => setMeetTitle(e.target.value)}
              placeholder="Título da reunião"
              className="h-8 text-xs"
            />
            <div className="flex gap-1.5">
              <Input
                type="datetime-local"
                value={meetWhen}
                onChange={(e) => setMeetWhen(e.target.value)}
                className="h-8 flex-1 text-xs"
              />
              <Button
                size="sm"
                disabled={busy || !meetTitle.trim() || !meetWhen}
                onClick={() => {
                  run(() =>
                    createMeeting({
                      leadId: lead.id,
                      title: meetTitle.trim(),
                      startsAt: new Date(meetWhen).toISOString(),
                    })
                  );
                  setMeetTitle("");
                  setMeetWhen("");
                }}
              >
                <CalendarPlus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Mensagens agendadas */}
        {scheduled.length > 0 && (
          <div>
            <label className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted-2)]">
              <Clock className="h-3 w-3" /> Mensagens agendadas
            </label>
            <div className="space-y-1.5">
              {scheduled.map((sm) => (
                <div
                  key={sm.id}
                  className="flex items-start gap-2 rounded-lg bg-[var(--color-surface-2)] px-2.5 py-2"
                >
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs">{sm.body}</p>
                    <p className="text-[11px] text-[var(--color-muted)]">
                      {new Date(sm.send_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <button
                    onClick={() => run(() => cancelScheduledMessage(sm.id, lead.id))}
                    className="text-[var(--color-muted-2)] hover:text-[var(--color-danger)]"
                    aria-label="Cancelar agendamento"
                    title="Cancelar"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notas internas */}
        <div>
          <label className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted-2)]">
            <StickyNote className="h-3 w-3" /> Notas internas
          </label>
          <div className="mb-2 space-y-1.5">
            {notes.slice(0, 5).map((n) => (
              <div key={n.id} className="rounded-lg bg-[var(--color-surface-2)] p-2 text-xs">
                <p className="whitespace-pre-wrap">{n.content}</p>
                <p className="mt-1 text-[11px] text-[var(--color-muted-2)]">
                  {n.author?.name ?? "—"} · {new Date(n.created_at).toLocaleDateString("pt-BR")}
                </p>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5">
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anotação (não vai pro WhatsApp)"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || !note.trim()}
              onClick={() => {
                run(() => addNote(lead.id, note.trim()));
                setNote("");
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
