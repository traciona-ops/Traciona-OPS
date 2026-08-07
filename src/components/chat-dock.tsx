"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  X,
  Loader2,
  Search,
  ArrowLeft,
  ExternalLink,
  SquarePen,
  UserPlus,
  CheckCheck,
  Image as ImageIcon,
  Mic,
  Video,
  FileText,
  Shapes,
  Settings2,
  BarChart3,
  Check,
  MoreVertical,
  RefreshCw,
  ChevronRight,
  Smartphone,
  Palette,
  Zap,
  Trash2,
  Plus,
  Pencil,
  ArrowLeftRight,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { fmtTimeBR, relativeDayBR, ymdBR } from "@/lib/dates";
import {
  markConversationRead,
  markAllConversationsRead,
  fetchThread,
  fetchDockContext,
  startConversation,
  getChatSettings,
  updateChatSettings,
  getConnectionStatus,
  deleteConversation,
  listQuickReplies,
  createQuickReply,
  deleteQuickReply,
  listChatNumbers,
  presenceKeepalive,
  type ChatSettings,
} from "@/app/(dashboard)/crm/whatsapp-actions";
import {
  requestChatHistory,
  listWaNumbers,
  addWaNumber,
  renameWaNumber,
  removeWaNumber,
} from "@/app/(dashboard)/settings/actions";
import {
  ChatPanel,
  LeadPanel,
  type LeadContext,
} from "@/components/crm/inbox-view";
import { WhatsappConnect } from "@/components/settings/whatsapp-connect";
import { WhatsAppIcon } from "@/components/whatsapp-icon";
import { useRole } from "@/components/role-context";
import { can } from "@/lib/permissions";
import {
  SECTOR,
  type QuickReply,
  type Sector,
  type WhatsappMessage,
} from "@/lib/types";

// Chat flutuante: a MENSAGERIA COMPLETA num modal de 90% da tela, em qualquer
// página. Reusa o ChatPanel (composer com anexo, áudio, respostas rápidas,
// agendar, IA) e o LeadPanel (etapa, valor, transferir, tags, tarefas, notas,
// reuniões, agendadas) do inbox — nada duplicado.

type Conv = {
  lead_id: string;
  name: string;
  phone: string | null;
  sector: Sector;
  avatar_url: string | null;
  is_client: boolean;
  in_pipeline: boolean;
  owner_id: string | null;
  owner_name: string | null;
  last_body: string | null;
  last_at: string;
  last_direction: "in" | "out";
  last_media_type: string | null;
  number_id: string | null;
  unread: number;
};

// ---- Cor do chat (preferência do usuário, salva no navegador) ----
const ACCENT_KEY = "traciona:chat:accent";
const ACCENTS = [
  { name: "Azul", color: "#1d6fff" },
  { name: "Verde WhatsApp", color: "#25d366" },
  { name: "Roxo", color: "#a78bfa" },
  { name: "Rosa", color: "#f472b6" },
  { name: "Laranja", color: "#f59e0b" },
  { name: "Grafite", color: "#334155" },
];

function useChatAccent(): [string, (c: string) => void] {
  const [accent, setAccentState] = useState("#1d6fff");
  useEffect(() => {
    const saved = localStorage.getItem(ACCENT_KEY);
    if (saved) setAccentState(saved);
    const onChange = (e: Event) =>
      setAccentState((e as CustomEvent<string>).detail);
    window.addEventListener("chat-accent", onChange);
    return () => window.removeEventListener("chat-accent", onChange);
  }, []);
  const setAccent = (c: string) => {
    localStorage.setItem(ACCENT_KEY, c);
    window.dispatchEvent(new CustomEvent("chat-accent", { detail: c }));
  };
  return [accent, setAccent];
}

// prévia da última mensagem com ícone Lucide (nada de emoji na UI)
const MEDIA_META: Record<string, { icon: LucideIcon; label: string }> = {
  image: { icon: ImageIcon, label: "Foto" },
  audio: { icon: Mic, label: "Áudio" },
  video: { icon: Video, label: "Vídeo" },
  document: { icon: FileText, label: "Documento" },
  sticker: { icon: Shapes, label: "Figurinha" },
};

// Prévia em texto puro: remove os marcadores de negrito e itálico do WhatsApp.
function stripWaFormat(s: string): string {
  return s
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1");
}

function ConvPreview({
  body,
  mediaType,
  out,
}: {
  body: string | null;
  mediaType: string | null;
  out: boolean;
}) {
  const media = mediaType ? MEDIA_META[mediaType] : null;
  const Icon = media?.icon;
  return (
    <p className="flex min-w-0 items-center gap-1 truncate text-xs text-[var(--color-muted)]">
      {out && <span className="shrink-0 text-[var(--color-muted-2)]">Você:</span>}
      {Icon && <Icon className="h-3 w-3 shrink-0 text-[var(--color-muted-2)]" />}
      <span className="truncate">
        {body ? stripWaFormat(body) : media?.label ?? ""}
      </span>
    </p>
  );
}

function listStamp(iso: string) {
  const label = relativeDayBR(iso);
  return label === "Hoje" ? fmtTimeBR(iso) : label;
}

/**
 * A mensageria em si (lista + conversa + painel do lead). Usada em dois
 * lugares: dentro do modal flutuante (variant "modal") e na página
 * /crm/mensagens em tela cheia (variant "page").
 */
export function ChatWorkspace({
  currentUserId,
  userName,
  initialLeadId,
  initialPrefsOpen = false,
  variant = "modal",
  onClose,
}: {
  currentUserId: string;
  userName: string;
  /** Abre direto essa conversa (ex.: ?lead= da página cheia). */
  initialLeadId?: string;
  /** Abre direto nas preferências (?prefs=1 — usado pelo banner de reconexão). */
  initialPrefsOpen?: boolean;
  variant?: "modal" | "page";
  onClose?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const role = useRole();
  const isAdmin = can.manageTeam(role);
  const [accent, setAccent] = useChatAccent();
  const [menuOpen, setMenuOpen] = useState(false);
  const [connOpen, setConnOpen] = useState(initialPrefsOpen);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [chatSettings, setChatSettings] = useState<ChatSettings | null>(null);
  const [reloading, setReloading] = useState(false);

  // Configurações estilo Groner: menu → seções (Número / Mensagens Rápidas / Preferências)
  const [prefsTab, setPrefsTab] = useState<
    "menu" | "numero" | "rapidas" | "prefs"
  >("menu");
  const [qrList, setQrList] = useState<QuickReply[] | null>(null);
  const [qrTitle, setQrTitle] = useState("");
  const [qrShortcut, setQrShortcut] = useState("");
  const [qrContent, setQrContent] = useState("");
  const [qrSaving, setQrSaving] = useState(false);
  const [syncingHist, setSyncingHist] = useState(false);
  const [histMsg, setHistMsg] = useState<string | null>(null);

  useEffect(() => {
    if (connOpen) setPrefsTab("menu");
  }, [connOpen]);

  async function loadQuickReplies() {
    const r = await listQuickReplies();
    if ("quickReplies" in r) setQrList(r.quickReplies as QuickReply[]);
  }
  useEffect(() => {
    if (prefsTab === "rapidas" && qrList === null) loadQuickReplies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsTab]);

  async function addQuickReply() {
    if (!qrTitle.trim() || !qrContent.trim()) return;
    setQrSaving(true);
    await createQuickReply({
      title: qrTitle.trim(),
      content: qrContent.trim(),
      shortcut: qrShortcut.trim() || undefined,
    });
    setQrSaving(false);
    setQrTitle("");
    setQrShortcut("");
    setQrContent("");
    loadQuickReplies();
  }

  async function removeQuickReply(id: string) {
    setQrList((prev) => (prev ?? []).filter((q) => q.id !== id));
    await deleteQuickReply(id);
    loadQuickReplies();
  }

  // ---- multi-número (lista + adicionar) ----
  type WaNumberRow = {
    id: string;
    name: string;
    jid: string | null;
    env_default: boolean;
  };
  const [waNumbers, setWaNumbers] = useState<WaNumberRow[] | null>(null);
  const [selNumberId, setSelNumberId] = useState<string | null>(null);
  const [numName, setNumName] = useState("");
  const [numBusy, setNumBusy] = useState(false);
  const [numErr, setNumErr] = useState<string | null>(null);

  async function loadNumbers(selectId?: string) {
    const r = await listWaNumbers();
    if ("numbers" in r) {
      setWaNumbers(r.numbers);
      setSelNumberId(
        (prev) => selectId ?? prev ?? r.numbers[0]?.id ?? null
      );
    }
  }
  useEffect(() => {
    if (prefsTab === "numero" && waNumbers === null) loadNumbers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsTab]);

  async function addNumber() {
    if (!numName.trim()) return;
    setNumBusy(true);
    setNumErr(null);
    const r = await addWaNumber(numName.trim());
    setNumBusy(false);
    if (r && "error" in r && r.error) {
      setNumErr(r.error);
      return;
    }
    setNumName("");
    await loadNumbers(r && "id" in r ? r.id : undefined);
  }

  const selNumber = waNumbers?.find((n) => n.id === selNumberId) ?? null;

  async function renameNumber(n: WaNumberRow) {
    const novo = prompt("Nome do número:", n.name);
    if (!novo || !novo.trim() || novo.trim() === n.name) return;
    await renameWaNumber(n.id, novo.trim());
    loadNumbers();
  }

  async function removeNumber(n: WaNumberRow) {
    if (
      !confirm(
        `Remover o número "${n.name}"?\nAs conversas dele passam a responder pelo número principal.`
      )
    )
      return;
    await removeWaNumber(n.id);
    setSelNumberId(null);
    loadNumbers();
  }

  async function forceHistory() {
    setSyncingHist(true);
    setHistMsg(null);
    const r = await requestChatHistory();
    setSyncingHist(false);
    if (r && typeof r === "object" && "error" in r && r.error) {
      setHistMsg(String(r.error));
    } else {
      setHistMsg("Pedido enviado — as conversas chegam em alguns minutos.");
    }
  }

  // configurações do número (carrega ao abrir as preferências)
  useEffect(() => {
    if (!connOpen || !isAdmin || chatSettings) return;
    getChatSettings().then(setChatSettings);
  }, [connOpen, isAdmin, chatSettings]);

  // status REAL da conexão na abertura (antes só chegava ao abrir uma conversa)
  useEffect(() => {
    getConnectionStatus().then((s) => setConnected(s.connected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleSetting(key: keyof ChatSettings) {
    if (!chatSettings) return;
    const next = { ...chatSettings, [key]: !chatSettings[key] };
    setChatSettings(next); // otimista
    const r = await updateChatSettings({ [key]: next[key] });
    if (r && "settings" in r && r.settings) setChatSettings(r.settings);
    else if (r && "error" in r) setChatSettings(chatSettings); // desfaz
  }

  const canDelete = can.deleteLead(role);
  async function deleteCurrent() {
    const sel = selected;
    if (!sel) return;
    const extra = sel.in_pipeline
      ? "O card no funil será mantido."
      : "O contato também some do chat (está fora do funil).";
    if (
      !confirm(
        `Excluir a conversa com ${sel.name}?\nTodas as mensagens e mídias serão apagadas. ${extra}`
      )
    )
      return;
    const r = await deleteConversation(sel.lead_id);
    if (r && "error" in r && r.error) {
      alert(r.error);
      return;
    }
    setSelected(null);
    setContext(null);
    setMsgs([]);
    loadConvs();
  }

  async function reloadAll() {
    if (reloading) return;
    setReloading(true);
    await loadConvs();
    if (selectedRef.current) {
      const [thread] = await Promise.all([
        fetchThread(selectedRef.current),
        loadContext(selectedRef.current),
      ]);
      if ("messages" in thread) setMsgs(thread.messages as WhatsappMessage[]);
    }
    setReloading(false);
  }
  const [todayStats, setTodayStats] = useState<{ in: number; out: number } | null>(
    null
  );

  async function openMetrics() {
    setMetricsOpen((o) => !o);
    setConnOpen(false);
    if (metricsOpen) return;
    // mensagens de hoje (fuso BR)
    const dayStart = new Date(`${ymdBR()}T00:00:00-03:00`).toISOString();
    const [inR, outR] = await Promise.all([
      supabase
        .from("whatsapp_messages")
        .select("id", { count: "exact", head: true })
        .eq("direction", "in")
        .gte("created_at", dayStart),
      supabase
        .from("whatsapp_messages")
        .select("id", { count: "exact", head: true })
        .eq("direction", "out")
        .gte("created_at", dayStart),
    ]);
    setTodayStats({ in: inR.count ?? 0, out: outR.count ?? 0 });
  }
  const [convs, setConvs] = useState<Conv[]>([]);
  const [search, setSearch] = useState("");
  const [secFilter, setSecFilter] = useState<Sector | "todos">("todos");
  const [ownerFilter, setOwnerFilter] = useState<string>("todos"); // todos | meus | none | <userId>
  // Batimento de presença: enquanto o chat estiver aberto, o número fica
  // "online" no WhatsApp (libera o "digitando..." dos contatos); fechou,
  // o cron devolve pra offline em até ~5 min.
  useEffect(() => {
    void presenceKeepalive();
    const iv = setInterval(() => void presenceKeepalive(), 3 * 60_000);
    return () => clearInterval(iv);
  }, []);

  // "digitando…" na LISTA (estilo WhatsApp): mapa lead → está digitando agora
  const [typingMap, setTypingMap] = useState<Record<string, boolean>>({});
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  // Fallback do "digitando…" na lista: polling leve a cada 4s (o realtime dá
  // o instantâneo quando entrega; o polling garante SEMPRE — lição da casa).
  useEffect(() => {
    const iv = setInterval(async () => {
      const { data } = await supabase
        .from("chat_presence")
        .select("lead_id, state, at")
        .gt("at", new Date(Date.now() - 9000).toISOString());
      const rows = (data ?? []) as {
        lead_id: string;
        state: string;
        at: string;
      }[];
      const fresh: Record<string, boolean> = {};
      for (const r of rows) if (r.state === "composing") fresh[r.lead_id] = true;
      setTypingMap((prev) => {
        // só re-renderiza se mudou de verdade
        const keys = new Set([...Object.keys(prev), ...Object.keys(fresh)]);
        for (const k of keys) if (!!prev[k] !== !!fresh[k]) return fresh;
        return prev;
      });
    }, 4000);
    return () => clearInterval(iv);
  }, [supabase]);

  // multi-número: cada número tem sua lista ("principal" = number_id null)
  const [numFilter, setNumFilter] = useState<string>("todos");
  const [numMenuOpen, setNumMenuOpen] = useState(false);
  // popovers (não-modais): Escape fecha, igual ao padrão dos menus do sistema
  useEffect(() => {
    if (!numMenuOpen && !menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setNumMenuOpen(false);
      setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [numMenuOpen, menuOpen]);
  const [chatNumbers, setChatNumbers] = useState<
    { id: string; name: string; env_default: boolean }[]
  >([]);
  useEffect(() => {
    listChatNumbers().then((r) => {
      if ("numbers" in r && r.numbers) setChatNumbers(r.numbers);
    });
  }, []);
  const [team, setTeam] = useState<{ id: string; name: string }[]>([]);
  const [markingAll, setMarkingAll] = useState(false);
  const [selected, setSelected] = useState<Conv | null>(null);
  const [msgs, setMsgs] = useState<WhatsappMessage[]>([]);
  const [context, setContext] = useState<LeadContext | null>(null);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [connected, setConnected] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected?.lead_id ?? null;

  // nova conversa
  const [newOpen, setNewOpen] = useState(false);
  const [newQuery, setNewQuery] = useState("");
  const [newResults, setNewResults] = useState<
    { id: string; name: string; phone: string | null; avatar_url: string | null }[]
  >([]);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newBusy, setNewBusy] = useState(false);
  const [newError, setNewError] = useState<string | null>(null);

  // busca leads existentes (mesmo sem conversa) enquanto digita
  useEffect(() => {
    if (!newOpen) return;
    const term = newQuery.trim();
    if (term.length < 2) {
      setNewResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("search_leads", { q: term });
      setNewResults(
        ((data ?? []) as typeof newResults).slice(0, 8)
      );
    }, 250);
    return () => clearTimeout(t);
  }, [newQuery, newOpen, supabase]);

  function pickLead(l: {
    id: string;
    name: string;
    phone: string | null;
    avatar_url: string | null;
  }) {
    setNewOpen(false);
    setNewQuery("");
    setNewName("");
    setNewPhone("");
    setNewError(null);
    openThread({
      lead_id: l.id,
      name: l.name,
      phone: l.phone,
      sector: "vendas",
      avatar_url: l.avatar_url,
      is_client: false,
      in_pipeline: true,
      owner_id: null,
      owner_name: null,
      last_body: null,
      last_at: "",
      last_direction: "out",
      last_media_type: null,
      number_id: null,
      unread: 0,
    });
  }

  async function createContact() {
    if (newBusy) return;
    setNewBusy(true);
    setNewError(null);
    const r = await startConversation({ phone: newPhone, name: newName });
    setNewBusy(false);
    if ("error" in r && r.error) {
      setNewError(r.error);
      return;
    }
    if ("lead" in r && r.lead) {
      pickLead(r.lead as { id: string; name: string; phone: string | null; avatar_url: string | null });
      loadConvs();
    }
  }

  const unreadTotal = useMemo(
    () => convs.reduce((a, c) => a + Number(c.unread || 0), 0),
    [convs]
  );

  const [convsLoaded, setConvsLoaded] = useState(false);
  async function loadConvs() {
    const { data } = await supabase.rpc("inbox_conversations");
    if (data) setConvs(data as Conv[]);
    setConvsLoaded(true);
  }

  // ?lead= na página cheia (ou deep-link): abre a conversa direto
  const initialOpened = useRef(false);
  useEffect(() => {
    if (!initialLeadId || initialOpened.current || !convsLoaded) return;
    initialOpened.current = true;
    const conv = convs.find((c) => c.lead_id === initialLeadId);
    if (conv) {
      openThread(conv);
      return;
    }
    // lead sem conversa ainda: monta a partir do contexto
    fetchDockContext(initialLeadId).then((r) => {
      if (!("context" in r)) return;
      const l = (r.context as { lead: { id: string; name: string; phone: string | null; avatar_url: string | null; sector: Sector; pipeline_id: string | null } }).lead;
      openThread({
        lead_id: l.id,
        name: l.name,
        phone: l.phone,
        sector: l.sector ?? "vendas",
        avatar_url: l.avatar_url,
        is_client: false,
        in_pipeline: !!l.pipeline_id,
        owner_id: null,
        owner_name: null,
        last_body: null,
        last_at: "",
        last_direction: "out",
        last_media_type: null,
        number_id: null,
        unread: 0,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLeadId, convsLoaded]);

  // time (pro filtro por responsável) — carrega quando abre o popup
  useEffect(() => {
    if (!open || team.length > 0) return;
    supabase
      .from("profiles")
      .select("id, name")
      .eq("active", true)
      .order("name")
      .then(({ data }) => setTeam((data ?? []) as { id: string; name: string }[]));
  }, [open, team.length, supabase]);

  async function markAll() {
    if (markingAll) return;
    setMarkingAll(true);
    await markAllConversationsRead();
    setMarkingAll(false);
    loadConvs();
  }

  async function loadContext(leadId: string) {
    const r = await fetchDockContext(leadId);
    if ("context" in r) {
      setContext(r.context as unknown as LeadContext);
      setQuickReplies((r.quickReplies ?? []) as QuickReply[]);
      setConnected(!!r.connected);
    }
  }

  async function openThread(c: Conv) {
    setSelected(c);
    setContext(null);
    setLoadingThread(true);
    const [thread] = await Promise.all([
      fetchThread(c.lead_id),
      loadContext(c.lead_id),
    ]);
    setLoadingThread(false);
    if ("messages" in thread) setMsgs(thread.messages as WhatsappMessage[]);
    if (c.unread > 0) markConversationRead(c.lead_id).then(loadConvs);
  }

  // lista + contador sempre vivos (mesmo com o popup fechado)
  useEffect(() => {
    loadConvs();
    const schedule = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(loadConvs, 800);
    };
    const channel = supabase
      .channel("wa-dock")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages" },
        (payload) => {
          schedule();
          const m = payload.new as WhatsappMessage;
          // conversa aberta no popup → marca lida na hora
          if (m.lead_id === selectedRef.current && m.direction === "in") {
            markConversationRead(m.lead_id);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "whatsapp_messages" },
        () => schedule()
      )
      // setor/responsável/nome mudou (aqui ou em outra tela) → lista atualiza,
      // senão o filtro por setor trabalha com dado velho
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "leads" },
        () => schedule()
      )
      .subscribe();

    // "digitando…" na lista: canal PRÓPRIO (várias assinaturas num canal só
    // podem se perder no supabase-js — presença fica isolada)
    const presenceChannel = supabase
      .channel("wa-presence")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_presence" },
        (payload) => {
          const row = payload.new as {
            lead_id?: string;
            state?: string;
          } | null;
          const id = row?.lead_id;
          if (!id) return;
          const composing = row?.state === "composing";
          setTypingMap((prev) => ({ ...prev, [id]: composing }));
          const timers = typingTimers.current;
          const old = timers.get(id);
          if (old) clearTimeout(old);
          if (composing) {
            timers.set(
              id,
              setTimeout(() => {
                setTypingMap((prev) => ({ ...prev, [id]: false }));
              }, 8000)
            );
          }
        }
      )
      .subscribe();
    // Rede de segurança: realtime morre silenciosamente em aba aberta há
    // horas — refetch ao focar a aba + tique de 30s garantem a lista fresca.
    const onFocus = () => {
      if (document.visibilityState === "visible") schedule();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    const iv = setInterval(schedule, 30_000);
    const timers = typingTimers.current;
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
      supabase.removeChannel(presenceChannel);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      clearInterval(iv);
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // busca ignora acentos (digitar "claudineia" acha "Claudinéia")
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "");

  const visible = convs.filter((c) => {
    if (numFilter !== "todos") {
      const key = c.number_id ?? "principal";
      if (key !== numFilter) return false;
    }
    if (secFilter !== "todos" && c.sector !== secFilter) return false;
    if (ownerFilter === "meus" && c.owner_id !== currentUserId) return false;
    if (ownerFilter === "none" && c.owner_id) return false;
    if (
      !["todos", "meus", "none"].includes(ownerFilter) &&
      c.owner_id !== ownerFilter
    )
      return false;
    const q = search.trim();
    if (!q) return true;
    if (norm(`${c.name} ${c.phone ?? ""}`).includes(norm(q))) return true;
    // telefone digitado com formatação — compara só os dígitos
    const digits = q.replace(/\D/g, "");
    return (
      digits.length >= 4 && (c.phone ?? "").replace(/\D/g, "").includes(digits)
    );
  });

  return (
    <div
      className="flex h-full w-full flex-1 overflow-hidden bg-[var(--color-surface)]"
      style={{ "--chat-accent": accent } as React.CSSProperties}
    >
            {/* lista de conversas (some quando a central de Configurações abre) */}
            <aside
              className={
                connOpen
                  ? "hidden"
                  : `w-full flex-col border-r border-[var(--color-border)] sm:flex sm:w-80 ${
                      selected ? "hidden" : "flex"
                    }`
              }
            >
              <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] bg-[var(--chat-accent)]/12">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/brand/symbol.svg"
                      alt="OPS Chat"
                      className="h-[22px] w-[22px]"
                    />
                    <span
                      className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-surface)]"
                      style={{
                        backgroundColor: connected
                          ? "var(--color-success)"
                          : "var(--color-danger)",
                      }}
                      title={connected ? "WhatsApp conectado" : "WhatsApp desconectado"}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-tight">OPS Chat</p>
                    <p className="text-[11px] leading-tight text-[var(--color-muted-2)]">
                      {numFilter !== "todos" &&
                        `${
                          chatNumbers.find(
                            (n) =>
                              (n.env_default ? "principal" : n.id) === numFilter
                          )?.name ?? "Número"
                        } · `}
                      {unreadTotal > 0
                        ? `${unreadTotal} não lida${unreadTotal > 1 ? "s" : ""}`
                        : "tudo em dia"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {/* trocar número (sempre visível, estilo Groner) */}
                  {chatNumbers.length > 0 && (
                    <div className="relative">
                      <button
                        onClick={() => setNumMenuOpen((o) => !o)}
                        title="Trocar número"
                        aria-label="Trocar número"
                        aria-haspopup="menu"
                        aria-expanded={numMenuOpen}
                        className={`flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
                          numFilter !== "todos"
                            ? "bg-[var(--chat-accent)]/12 text-[var(--chat-accent)]"
                            : "text-[var(--color-muted-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--chat-accent)]"
                        }`}
                      >
                        <ArrowLeftRight className="h-[18px] w-[18px]" />
                      </button>
                      {numMenuOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setNumMenuOpen(false)}
                          />
                          <div className="absolute left-0 top-11 z-20 w-52 rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-1 shadow-xl">
                            <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-2)]">
                              Trocar número
                            </p>
                            {[
                              { value: "todos", label: "Todos os números" },
                              ...chatNumbers.map((n) => ({
                                value: n.env_default ? "principal" : n.id,
                                label: n.name,
                              })),
                            ].map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() => {
                                  setNumFilter(opt.value);
                                  setNumMenuOpen(false);
                                }}
                                className="flex w-full items-center gap-2 rounded-[var(--radius-control)] px-2.5 py-2 text-left text-sm transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                              >
                                <span className="min-w-0 flex-1 truncate">
                                  {opt.label}
                                </span>
                                {numFilter === opt.value && (
                                  <Check className="h-4 w-4 shrink-0 text-[var(--chat-accent)]" />
                                )}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* ação principal sempre à mão */}
                  <button
                    onClick={() => {
                      setNewOpen((o) => !o);
                      setNewError(null);
                    }}
                    className={`flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
                      newOpen
                        ? "bg-[var(--chat-accent)]/12 text-[var(--chat-accent)]"
                        : "text-[var(--color-muted-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--chat-accent)]"
                    }`}
                    title="Nova conversa"
                    aria-label="Nova conversa"
                    aria-expanded={newOpen}
                  >
                    <SquarePen className="h-[18px] w-[18px]" />
                  </button>

                  {/* o resto vive no menu ⋮ (padrão WhatsApp) */}
                  <div className="relative">
                    <button
                      onClick={() => setMenuOpen((o) => !o)}
                      className={`flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
                        menuOpen
                          ? "bg-[var(--color-surface-2)] text-[var(--color-foreground)]"
                          : "text-[var(--color-muted-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
                      }`}
                      title="Mais opções"
                      aria-label="Mais opções"
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                    >
                      <MoreVertical className="h-[18px] w-[18px]" />
                    </button>
                    {menuOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setMenuOpen(false)}
                        />
                        <div className="absolute right-0 top-11 z-20 w-60 rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-1.5 shadow-xl">
                          <button
                            onClick={() => {
                              setMenuOpen(false);
                              openMetrics();
                            }}
                            className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-left text-sm transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                          >
                            <BarChart3 className="h-4 w-4 text-[var(--color-muted)]" />
                            Métricas das conversas
                          </button>
                          <button
                            onClick={() => {
                              setMenuOpen(false);
                              markAll();
                            }}
                            disabled={markingAll || unreadTotal === 0}
                            className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-left text-sm transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                          >
                            {markingAll ? (
                              <Loader2 className="h-4 w-4 animate-spin text-[var(--color-muted)]" />
                            ) : (
                              <CheckCheck className="h-4 w-4 text-[var(--color-muted)]" />
                            )}
                            Marcar todas como lidas
                            {unreadTotal > 0 && (
                              <span className="ml-auto rounded-full bg-[var(--chat-accent)]/12 px-1.5 text-[11px] font-semibold text-[var(--chat-accent)]">
                                {unreadTotal > 99 ? "99+" : unreadTotal}
                              </span>
                            )}
                          </button>
                          {variant === "modal" && (
                            <a
                              href={`/chat${
                                selected ? `?lead=${selected.lead_id}` : ""
                              }`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => {
                                setMenuOpen(false);
                                onClose?.();
                              }}
                              className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-left text-sm transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                            >
                              <ExternalLink className="h-4 w-4 text-[var(--color-muted)]" />
                              Abrir como app
                            </a>
                          )}
                          <button
                            onClick={() => {
                              setMenuOpen(false);
                              reloadAll();
                            }}
                            className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-left text-sm transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                          >
                            <RefreshCw
                              className={`h-4 w-4 text-[var(--color-muted)] ${
                                reloading ? "animate-spin" : ""
                              }`}
                            />
                            Recarregar chat
                          </button>
                          <div className="my-1 h-px bg-[var(--color-border)]" />
                          <button
                            onClick={() => {
                              setMenuOpen(false);
                              setConnOpen(true);
                              setMetricsOpen(false);
                            }}
                            className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-left text-sm transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                          >
                            <Settings2 className="h-4 w-4 text-[var(--color-muted)]" />
                            Configurações
                          </button>
                          <p className="px-2.5 pb-1 pt-1.5 text-[11px] text-[var(--color-muted-2)]">
                            Conectado como {userName.split(" ")[0]}
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  {onClose && (
                    <button
                      onClick={onClose}
                      className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-muted-2)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                      aria-label="Fechar"
                    >
                      <X className="h-[18px] w-[18px]" />
                    </button>
                  )}
                </div>
              </div>

              {/* nova conversa: busca lead OU cria contato novo */}
              {newOpen && (
                <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-4 py-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-2)]">
                    Nova conversa
                  </p>
                  <div className="flex h-9 items-center gap-2 rounded-[var(--radius-field)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 transition focus-within:border-[var(--color-primary)]">
                    <Search className="h-3.5 w-3.5 text-[var(--color-muted-2)]" />
                    <input
                      value={newQuery}
                      onChange={(e) => setNewQuery(e.target.value)}
                      placeholder="Buscar lead por nome ou número"
                      autoFocus
                      className="w-full bg-transparent text-xs outline-none placeholder:text-[var(--color-muted-2)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                    />
                  </div>
                  {newResults.length > 0 && (
                    <div className="mt-2 max-h-44 divide-y divide-[var(--color-border)]/60 overflow-y-auto rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
                      {newResults.map((l) => (
                        <button
                          key={l.id}
                          onClick={() => pickLead(l)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                        >
                          <Avatar name={l.name} src={l.avatar_url} size={30} />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">{l.name}</p>
                            <p className="truncate text-[11px] text-[var(--color-muted-2)]">
                              {l.phone ?? "sem telefone"}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="my-3 flex items-center gap-2">
                    <span className="h-px flex-1 bg-[var(--color-border)]" />
                    <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-muted-2)]">
                      ou novo contato
                    </span>
                    <span className="h-px flex-1 bg-[var(--color-border)]" />
                  </div>

                  <div className="space-y-2">
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Nome"
                      className="h-9 w-full rounded-[var(--radius-field)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-xs transition focus:border-[var(--color-primary)] focus:outline-none"
                    />
                    <input
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && createContact()}
                      placeholder="WhatsApp (ex.: 5511999998888)"
                      className="h-9 w-full rounded-[var(--radius-field)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-xs transition focus:border-[var(--color-primary)] focus:outline-none"
                    />
                    {newError && (
                      <p className="rounded-[var(--radius-card)] bg-[var(--color-danger)]/10 px-3 py-2 text-[11px] text-[var(--color-danger)]">
                        {newError}
                      </p>
                    )}
                    <button
                      onClick={createContact}
                      disabled={newBusy || !newPhone.trim()}
                      className="flex h-9 w-full items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--chat-accent)] text-xs font-semibold text-[var(--color-primary-foreground)] shadow-sm transition hover:opacity-90 disabled:opacity-50"
                    >
                      {newBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <UserPlus className="h-3.5 w-3.5" />
                      )}
                      Criar e abrir conversa
                    </button>
                    <p className="text-[11px] leading-relaxed text-[var(--color-muted-2)]">
                      Número repetido abre a conversa do lead existente, sem
                      duplicar.
                    </p>
                  </div>
                </div>
              )}
              <div className="space-y-2 border-b border-[var(--color-border)] px-4 py-3">
                <div className="flex h-9 items-center gap-2 rounded-[var(--radius-field)] bg-[var(--color-surface-2)] px-3 ring-1 ring-transparent transition focus-within:ring-[var(--color-primary)]/40">
                  <Search className="h-3.5 w-3.5 text-[var(--color-muted-2)]" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar conversa"
                    className="w-full bg-transparent text-xs outline-none placeholder:text-[var(--color-muted-2)]"
                  />
                </div>

                {/* número (só com mais de um conectável) */}
                {chatNumbers.length > 1 && (
                  <select
                    value={numFilter}
                    onChange={(e) => setNumFilter(e.target.value)}
                    className="h-8 w-full cursor-pointer rounded-[var(--radius-field)] border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 text-[11px] text-[var(--color-muted)] transition focus:border-[var(--color-primary)] focus:outline-none"
                  >
                    <option value="todos">Todos os números</option>
                    {chatNumbers.map((n) => (
                      <option
                        key={n.id}
                        value={n.env_default ? "principal" : n.id}
                      >
                        {n.name}
                      </option>
                    ))}
                  </select>
                )}

                {/* setor + responsável, lado a lado, no mesmo formato */}
                <div className="flex gap-2">
                  <select
                    value={secFilter}
                    onChange={(e) => setSecFilter(e.target.value as Sector | "todos")}
                    className="h-8 min-w-0 flex-1 cursor-pointer rounded-[var(--radius-field)] border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 text-[11px] text-[var(--color-muted)] transition focus:border-[var(--color-primary)] focus:outline-none"
                  >
                    <option value="todos">Todos os setores</option>
                    {(Object.keys(SECTOR) as Sector[]).map((s) => (
                      <option key={s} value={s}>
                        {SECTOR[s].label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={ownerFilter}
                    onChange={(e) => setOwnerFilter(e.target.value)}
                    className="h-8 min-w-0 flex-1 cursor-pointer rounded-[var(--radius-field)] border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 text-[11px] text-[var(--color-muted)] transition focus:border-[var(--color-primary)] focus:outline-none"
                  >
                    <option value="todos">Todos os responsáveis</option>
                    <option value="meus">Minhas conversas</option>
                    <option value="none">Sem responsável</option>
                    {team.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex-1 divide-y divide-[var(--color-border)]/60 overflow-y-auto">
                {visible.map((c) => {
                  const active = selected?.lead_id === c.lead_id;
                  return (
                    <button
                      key={c.lead_id}
                      onClick={() => openThread(c)}
                      className={`relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                        active
                          ? "bg-[var(--color-primary)]/8"
                          : "hover:bg-[var(--color-surface-2)]"
                      }`}
                    >
                      {active && (
                        <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[var(--color-primary)]" />
                      )}
                      <Avatar name={c.name} src={c.avatar_url} size={42} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p
                            className={`flex min-w-0 items-center gap-1.5 truncate text-[13px] ${
                              c.unread > 0
                                ? "font-semibold text-[var(--color-foreground)]"
                                : "font-medium"
                            }`}
                          >
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{
                                backgroundColor:
                                  SECTOR[c.sector]?.color ?? "var(--color-muted-2)",
                              }}
                              title={SECTOR[c.sector]?.label}
                            />
                            <span className="truncate">{c.name}</span>
                          </p>
                          <span
                            className={`shrink-0 text-[11px] ${
                              c.unread > 0
                                ? "font-semibold text-[var(--chat-accent)]"
                                : "text-[var(--color-muted-2)]"
                            }`}
                          >
                            {c.last_at ? listStamp(c.last_at) : ""}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          {typingMap[c.lead_id] ? (
                            <p className="truncate text-xs font-medium italic text-[var(--color-success)]">
                              digitando…
                            </p>
                          ) : (
                            <ConvPreview
                              body={c.last_body}
                              mediaType={c.last_media_type}
                              out={c.last_direction === "out"}
                            />
                          )}
                          <span className="flex shrink-0 items-center gap-1.5">
                            {!c.in_pipeline && (
                              <span
                                className="rounded bg-[color-mix(in_srgb,var(--color-warning)_15%,var(--color-surface))] px-1 py-px text-[11px] font-semibold text-[var(--color-warning)]"
                                title="Só no chat — sem card no funil"
                              >
                                sem card
                              </span>
                            )}
                            {c.owner_name && (
                              <span title={`Responsável: ${c.owner_name}`}>
                                <Avatar name={c.owner_name} size={16} />
                              </span>
                            )}
                            {c.unread > 0 && (
                              <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--chat-accent)] px-1 text-[11px] font-bold text-[var(--color-primary-foreground)]">
                                {c.unread > 99 ? "99+" : c.unread}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {visible.length === 0 && (
                  <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                    <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-surface-2)]">
                      <Search className="h-5 w-5 text-[var(--color-muted-2)]" />
                    </div>
                    <p className="text-xs text-[var(--color-muted)]">
                      Nenhuma conversa com esses filtros.
                    </p>
                    {(secFilter !== "todos" ||
                      ownerFilter !== "todos" ||
                      numFilter !== "todos" ||
                      search) && (
                      <button
                        onClick={() => {
                          setSecFilter("todos");
                          setOwnerFilter("todos");
                          setNumFilter("todos");
                          setSearch("");
                        }}
                        className="text-xs font-medium text-[var(--color-primary)] hover:underline"
                      >
                        Limpar filtros
                      </button>
                    )}
                  </div>
                )}
              </div>
            </aside>

            {/* conversa (ChatPanel completo do inbox) */}
            <div
              className={`min-w-0 flex-1 flex-col ${
                selected || connOpen || metricsOpen ? "flex" : "hidden sm:flex"
              }`}
            >
              {connOpen ? (
                <div className="flex flex-1 overflow-hidden">
                  {/* coluna ESQUERDA: central de configurações (estilo Groner) */}
                  <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--color-surface)] sm:w-96 sm:shrink-0 sm:border-r sm:border-[var(--color-border)]">
                  {/* cabeçalho estilo Groner: ← volta pro menu (ou fecha) */}
                  <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
                    <button
                      onClick={() =>
                        prefsTab === "menu"
                          ? setConnOpen(false)
                          : setPrefsTab("menu")
                      }
                      aria-label="Voltar"
                      className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <h2 className="text-sm font-semibold">
                      {prefsTab === "menu"
                        ? "Configurações"
                        : prefsTab === "numero"
                        ? "Número"
                        : prefsTab === "rapidas"
                        ? "Mensagens Rápidas"
                        : "Preferências"}
                    </h2>
                  </div>

                  <div className="flex-1 overflow-y-auto bg-[var(--color-background)]">
                    <div className="w-full space-y-4 p-4">
                      {/* ---------- menu ---------- */}
                      {prefsTab === "menu" && (
                        <div className="card divide-y divide-[var(--color-border)]/60 overflow-hidden p-0">
                          {(
                            [
                              isAdmin
                                ? {
                                    key: "numero" as const,
                                    icon: Smartphone,
                                    title: "Número",
                                    desc: connected
                                      ? "Conectado e operando"
                                      : "Desconectado",
                                  }
                                : null,
                              {
                                key: "rapidas" as const,
                                icon: Zap,
                                title: "Mensagens Rápidas",
                                desc: "Templates com atalho / no chat",
                              },
                              {
                                key: "prefs" as const,
                                icon: Palette,
                                title: "Preferências",
                                desc: "Cor do chat",
                              },
                            ].filter(Boolean) as {
                              key: "numero" | "rapidas" | "prefs";
                              icon: LucideIcon;
                              title: string;
                              desc: string;
                            }[]
                          ).map((item) => {
                            const Icon = item.icon;
                            return (
                              <button
                                key={item.key}
                                onClick={() => setPrefsTab(item.key)}
                                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-[var(--color-surface-2)]"
                              >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--chat-accent)]/10">
                                  <Icon className="h-[18px] w-[18px] text-[var(--chat-accent)]" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-medium">
                                    {item.title}
                                  </span>
                                  <span className="block text-[11px] text-[var(--color-muted-2)]">
                                    {item.desc}
                                  </span>
                                </span>
                                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-muted-2)]" />
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* ---------- Número (admin) ---------- */}
                      {prefsTab === "numero" && isAdmin && (
                        <>
                          {/* lista de números + adicionar (estilo Groner) */}
                          <div className="card overflow-hidden p-0">
                            <p className="px-4 pb-1 pt-3.5 text-sm font-semibold">
                              Números
                            </p>
                            {waNumbers === null ? (
                              <div className="flex justify-center py-6">
                                <Loader2 className="h-4 w-4 animate-spin text-[var(--color-muted)]" />
                              </div>
                            ) : (
                              <div className="divide-y divide-[var(--color-border)]/60">
                                {waNumbers.map((n) => (
                                  <div
                                    key={n.id}
                                    onClick={() => setSelNumberId(n.id)}
                                    role="button"
                                    tabIndex={0}
                                    className={`flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition ${
                                      selNumberId === n.id
                                        ? "bg-[var(--chat-accent)]/8"
                                        : "hover:bg-[var(--color-surface-2)]"
                                    }`}
                                  >
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--chat-accent)]/10">
                                      <Smartphone className="h-4 w-4 text-[var(--chat-accent)]" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="flex items-center gap-1.5 text-sm font-medium">
                                        <span className="truncate">
                                          {n.name}
                                        </span>
                                        {n.env_default && (
                                          <span className="shrink-0 rounded bg-[var(--chat-accent)]/10 px-1.5 py-px text-[11px] font-bold uppercase text-[var(--chat-accent)]">
                                            Principal
                                          </span>
                                        )}
                                      </span>
                                      {n.jid && (
                                        <span className="block truncate font-mono text-[11px] text-[var(--color-muted-2)]">
                                          {n.jid.split(":")[0].split("@")[0]}
                                        </span>
                                      )}
                                    </span>
                                    <span className="flex shrink-0 items-center gap-0.5">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          renameNumber(n);
                                        }}
                                        title="Renomear"
                                        aria-label={`Renomear ${n.name}`}
                                        className="flex min-h-9 min-w-9 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-muted-2)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </button>
                                      {!n.env_default && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            removeNumber(n);
                                          }}
                                          title="Remover número"
                                          aria-label={`Remover ${n.name}`}
                                          className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-muted-2)] transition hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                      {selNumberId === n.id && (
                                        <Check className="ml-0.5 h-4 w-4 text-[var(--chat-accent)]" />
                                      )}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="border-t border-[var(--color-border)] p-3">
                              <div className="flex gap-2">
                                <input
                                  value={numName}
                                  onChange={(e) => setNumName(e.target.value)}
                                  placeholder="Nome do número"
                                  className="h-10 min-w-0 flex-1 rounded-[var(--radius-field)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm focus:border-[var(--chat-accent)] focus:outline-none"
                                />
                                <button
                                  onClick={addNumber}
                                  disabled={numBusy || !numName.trim()}
                                  className="flex h-10 shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--chat-accent)] px-3.5 text-sm font-semibold text-[var(--color-primary-foreground)] transition hover:brightness-105 disabled:opacity-50"
                                >
                                  {numBusy ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Plus className="h-4 w-4" />
                                  )}
                                  Adicionar
                                </button>
                              </div>
                              {numErr && (
                                <p className="mt-2 rounded-[var(--radius-card)] bg-[var(--color-danger)]/10 px-3 py-1.5 text-xs text-[var(--color-danger)]">
                                  {numErr}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* conexão do número selecionado */}
                          {selNumber && (
                            <div className="card p-6">
                              <WhatsappConnect
                                key={selNumber.id}
                                initialConnected={
                                  selNumber.env_default ? connected : false
                                }
                                embedded
                                numberId={
                                  selNumber.env_default
                                    ? undefined
                                    : selNumber.id
                                }
                              />
                            </div>
                          )}
                          <div className="card p-6">
                            <h2 className="text-sm font-semibold">
                              Configurações do número
                            </h2>
                            <div className="mt-3 divide-y divide-[var(--color-border)]/60">
                              {(
                                [
                                  {
                                    key: "signature" as const,
                                    title: "Assinatura da mensagem",
                                    desc: "Adiciona o nome do atendente ao final de cada mensagem enviada",
                                  },
                                  {
                                    key: "auto_create_card" as const,
                                    title: "Criar card automaticamente",
                                    desc: "Mensagem recebida de número novo já cria o card no funil (desligado = fica só no chat até você adicionar)",
                                  },
                                ] as const
                              ).map((opt) => {
                                const on = !!chatSettings?.[opt.key];
                                return (
                                  <div
                                    key={opt.key}
                                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium">
                                        {opt.title}
                                      </p>
                                      <p className="mt-0.5 text-[11px] leading-snug text-[var(--color-muted-2)]">
                                        {opt.desc}
                                      </p>
                                    </div>
                                    <button
                                      onClick={() => toggleSetting(opt.key)}
                                      disabled={!chatSettings}
                                      role="switch"
                                      aria-checked={on}
                                      aria-label={opt.title}
                                      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40 ${
                                        on
                                          ? "bg-[var(--chat-accent)]"
                                          : "bg-[var(--color-border-strong)]"
                                      }`}
                                    >
                                      <span
                                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-[var(--color-surface)] shadow transition-all ${
                                          on ? "left-[22px]" : "left-0.5"
                                        }`}
                                      />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="card flex items-center gap-3 p-4">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium">
                                Forçar sincronização de conversas
                              </p>
                              <p className="mt-0.5 text-[11px] text-[var(--color-muted-2)]">
                                Busca o histórico recente do WhatsApp e salva no
                                sistema
                              </p>
                              {histMsg && (
                                <p className="mt-1 text-[11px] text-[var(--color-success)]">
                                  {histMsg}
                                </p>
                              )}
                            </div>
                            <button
                              onClick={forceHistory}
                              disabled={syncingHist}
                              className="flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-3 text-xs font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] disabled:opacity-50"
                            >
                              {syncingHist ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3.5 w-3.5" />
                              )}
                              Sincronizar
                            </button>
                          </div>
                        </>
                      )}

                      {/* ---------- Mensagens Rápidas ---------- */}
                      {prefsTab === "rapidas" && (
                        <>
                          <div className="card p-5">
                            <div className="mb-2 flex items-center justify-between">
                              <h3 className="text-sm font-semibold">
                                Templates
                              </h3>
                              <span className="text-[11px] text-[var(--color-muted-2)]">
                                {qrList ? `${qrList.length} salvos` : "…"}
                              </span>
                            </div>
                            <p className="mb-3 text-[11px] text-[var(--color-muted-2)]">
                              Na conversa, digite <b>/</b> pra usar. Variáveis:{" "}
                              {"{nome}"}, {"{saudacao}"}, {"{meu_nome}"}.
                            </p>
                            {qrList === null ? (
                              <div className="flex justify-center py-6">
                                <Loader2 className="h-4 w-4 animate-spin text-[var(--color-muted)]" />
                              </div>
                            ) : qrList.length === 0 ? (
                              <p className="py-4 text-center text-xs text-[var(--color-muted-2)]">
                                Nenhum template ainda — crie o primeiro abaixo.
                              </p>
                            ) : (
                              <div className="divide-y divide-[var(--color-border)]/60">
                                {qrList.map((q) => (
                                  <div
                                    key={q.id}
                                    className="flex items-start gap-2 py-2.5"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className="flex items-center gap-1.5 text-sm font-medium">
                                        <span className="truncate">
                                          {q.title}
                                        </span>
                                        {q.shortcut && (
                                          <span className="shrink-0 rounded bg-[var(--chat-accent)]/10 px-1 font-mono text-[11px] text-[var(--chat-accent)]">
                                            /{q.shortcut.replace(/^\//, "")}
                                          </span>
                                        )}
                                      </p>
                                      <p className="truncate text-[11px] text-[var(--color-muted-2)]">
                                        {q.content}
                                      </p>
                                    </div>
                                    <button
                                      onClick={() => removeQuickReply(q.id)}
                                      aria-label={`Excluir template ${q.title}`}
                                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-muted-2)] transition hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="card space-y-2.5 p-5">
                            <h3 className="text-sm font-semibold">
                              Novo template
                            </h3>
                            <div className="flex gap-2">
                              <input
                                value={qrTitle}
                                onChange={(e) => setQrTitle(e.target.value)}
                                placeholder="Título"
                                className="h-10 min-w-0 flex-1 rounded-[var(--radius-field)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm focus:border-[var(--chat-accent)] focus:outline-none"
                              />
                              <input
                                value={qrShortcut}
                                onChange={(e) => setQrShortcut(e.target.value)}
                                placeholder="/atalho"
                                className="h-10 w-28 rounded-[var(--radius-field)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 font-mono text-sm focus:border-[var(--chat-accent)] focus:outline-none"
                              />
                            </div>
                            <textarea
                              value={qrContent}
                              onChange={(e) => setQrContent(e.target.value)}
                              rows={3}
                              placeholder="Mensagem (use {nome}, {saudacao}, {meu_nome})"
                              className="w-full resize-none rounded-[var(--radius-field)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2.5 text-sm focus:border-[var(--chat-accent)] focus:outline-none"
                            />
                            <button
                              onClick={addQuickReply}
                              disabled={
                                qrSaving || !qrTitle.trim() || !qrContent.trim()
                              }
                              className="flex h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--chat-accent)] text-sm font-semibold text-[var(--color-primary-foreground)] transition hover:brightness-105 disabled:opacity-50"
                            >
                              {qrSaving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Plus className="h-4 w-4" />
                              )}
                              Salvar template
                            </button>
                          </div>
                        </>
                      )}

                      {/* ---------- Preferências ---------- */}
                      {prefsTab === "prefs" && (
                        <div className="card p-6">
                          <h2 className="text-sm font-semibold">Cor do chat</h2>
                          <p className="mt-0.5 text-[11px] text-[var(--color-muted-2)]">
                            Só muda pra você, neste navegador.
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2.5">
                            {ACCENTS.map((a) => (
                              <button
                                key={a.color}
                                onClick={() => setAccent(a.color)}
                                title={a.name}
                                aria-label={`Cor ${a.name}`}
                                className="flex h-9 w-9 items-center justify-center rounded-full transition hover:scale-110"
                                style={{
                                  backgroundColor: a.color,
                                  boxShadow:
                                    accent === a.color
                                      ? `0 0 0 2px var(--color-surface), 0 0 0 4px ${a.color}`
                                      : undefined,
                                }}
                              >
                                {accent === a.color && (
                                  <Check className="h-4 w-4 text-[var(--color-primary-foreground)]" />
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  </div>

                  {/* lado DIREITO: o chat some — fica a vitrine do OPS Chat */}
                  <div className="hidden flex-1 flex-col items-center justify-center gap-3 bg-[var(--color-background)] text-center sm:flex">
                    <div className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-card)] bg-[var(--chat-accent)]/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/brand/symbol.svg"
                        alt="OPS Chat"
                        className="h-9 w-9"
                      />
                    </div>
                    <div>
                      <p className="text-lg font-semibold tracking-tight">
                        OPS Chat
                      </p>
                      <p className="mt-1 px-8 text-xs text-[var(--color-muted-2)]">
                        Conecte, converse e acompanhe — tudo integrado ao funil
                        da Traciona.
                      </p>
                    </div>
                  </div>
                </div>
              ) : metricsOpen ? (
                <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto bg-[var(--color-background)] p-6">
                  <div className="w-full max-w-md space-y-4">
                    {/* hoje */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="card p-4">
                        <p className="text-[11px] text-[var(--color-muted)]">
                          Recebidas hoje
                        </p>
                        <p className="mt-1 text-2xl font-semibold tracking-tight">
                          {todayStats ? todayStats.in : "…"}
                        </p>
                      </div>
                      <div className="card p-4">
                        <p className="text-[11px] text-[var(--color-muted)]">
                          Enviadas hoje
                        </p>
                        <p className="mt-1 text-2xl font-semibold tracking-tight">
                          {todayStats ? todayStats.out : "…"}
                        </p>
                      </div>
                    </div>

                    {/* funil das conversas */}
                    <div className="card p-5">
                      <h2 className="mb-4 text-sm font-semibold">
                        Funil das conversas
                      </h2>
                      <div className="space-y-3">
                        {(() => {
                          const total = convs.length;
                          const rows = [
                            { label: "Conversas", n: total, color: accent },
                            {
                              label: "Não lidas",
                              n: convs.filter((c) => c.unread > 0).length,
                              color: "var(--color-warning)",
                            },
                            {
                              label: "Aguardando atendimento",
                              n: convs.filter((c) => !c.owner_id).length,
                              color: "var(--color-warning)",
                            },
                            {
                              label: "Em atendimento",
                              n: convs.filter((c) => c.owner_id).length,
                              color: accent,
                            },
                            {
                              label: "No funil (com card)",
                              n: convs.filter((c) => c.in_pipeline).length,
                              color: accent,
                            },
                            {
                              label: "Clientes ativos",
                              n: convs.filter((c) => c.is_client).length,
                              color: "var(--color-success)",
                            },
                          ];
                          const max = Math.max(1, total);
                          return rows.map((r) => (
                            <div key={r.label}>
                              <div className="mb-1 flex items-center justify-between text-xs">
                                <span>{r.label}</span>
                                <span className="font-semibold">
                                  {r.n}
                                  {total > 0 && r.label !== "Conversas" && (
                                    <span className="ml-1 font-normal text-[var(--color-muted-2)]">
                                      ({Math.round((r.n / max) * 100)}%)
                                    </span>
                                  )}
                                </span>
                              </div>
                              <div className="h-2 rounded-full bg-[var(--color-surface-2)]">
                                <div
                                  className="h-2 rounded-full transition-all"
                                  style={{
                                    width: `${(r.n / max) * 100}%`,
                                    backgroundColor: r.color,
                                  }}
                                />
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                      <p className="mt-3 text-[11px] text-[var(--color-muted-2)]">
                        Filtros de setor/responsável não afetam estes números —
                        é a visão geral de tudo que você pode ver.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setMetricsOpen(false)}
                    className="mt-4 text-xs font-medium text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                  >
                    Voltar pras conversas
                  </button>
                </div>
              ) : selected ? (
                <>
                  {/* barra mobile: voltar pra lista */}
                  <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-2 py-1.5 sm:hidden">
                    <button
                      onClick={() => setSelected(null)}
                      className="flex min-h-9 min-w-9 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-muted-2)]"
                      aria-label="Voltar"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <span className="text-sm font-medium">{selected.name}</span>
                  </div>
                  {loadingThread ? (
                    <div className="flex flex-1 items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted)]" />
                    </div>
                  ) : (
                    <ChatPanel
                      key={selected.lead_id}
                      lead={{
                        id: selected.lead_id,
                        name: selected.name,
                        phone: selected.phone,
                        avatar_url: selected.avatar_url,
                      }}
                      messages={msgs}
                      connected={connected}
                      quickReplies={quickReplies}
                      userName={userName}
                      currentUserId={currentUserId}
                      owner={
                        context
                          ? context.lead.owner
                            ? {
                                id: context.lead.owner.id,
                                name: context.lead.owner.name,
                              }
                            : null
                          : undefined
                      }
                      inPipeline={context ? !!context.lead.pipeline_id : undefined}
                      onBack={() => {
                        setSelected(null);
                        setContext(null);
                        setMsgs([]);
                      }}
                      onDelete={canDelete ? deleteCurrent : undefined}
                      onOwnerChanged={async () => {
                        await loadContext(selected.lead_id);
                        loadConvs();
                      }}
                      onSync={async () => {
                        const [thread] = await Promise.all([
                          fetchThread(selected.lead_id),
                          loadContext(selected.lead_id),
                        ]);
                        if ("messages" in thread) {
                          setMsgs(thread.messages as WhatsappMessage[]);
                        }
                        loadConvs();
                      }}
                    />
                  )}
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-[var(--color-background)] text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-card)] bg-[var(--chat-accent)]/10">
                    <WhatsAppIcon className="h-9 w-9 text-[var(--chat-accent)]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Suas conversas do WhatsApp</p>
                    <p className="mt-1 px-8 text-xs text-[var(--color-muted-2)]">
                      Selecione uma conversa ao lado ou comece uma nova com o
                      botão de escrever lá em cima.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* painel do lead (etapa, transferir, tags, tarefas, notas...) */}
            {selected && context && !loadingThread && (
              <div className="hidden xl:flex">
                <LeadPanel
                  context={context}
                  currentUserId={currentUserId}
                  onChanged={async () => {
                    // painel E lista: setor/valor/tag mudou → filtro enxerga
                    await loadContext(selected.lead_id);
                    loadConvs();
                  }}
                  hideStage
                />
              </div>
            )}
    </div>
  );
}

/**
 * Botão flutuante + modal de 90% da tela. O conteúdo é o ChatWorkspace —
 * o mesmo componente da página /crm/mensagens.
 */
export function ChatDock({
  currentUserId,
  userName,
}: {
  currentUserId: string;
  userName: string;
}) {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [accent] = useChatAccent();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const countTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // contador de não-lidas do botão (leve — só um count, com realtime)
  useEffect(() => {
    async function refresh() {
      const { count } = await supabase
        .from("whatsapp_messages")
        .select("id", { count: "exact", head: true })
        .eq("direction", "in")
        .is("read_at", null);
      setUnread(count ?? 0);
    }
    const schedule = () => {
      if (countTimer.current) clearTimeout(countTimer.current);
      countTimer.current = setTimeout(refresh, 700);
    };
    refresh();
    const channel = supabase
      .channel("wa-dock-badge")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_messages" },
        () => schedule()
      )
      .subscribe();
    // fallback pro realtime que morre em aba antiga (mesma rede do popup)
    const onFocus = () => {
      if (document.visibilityState === "visible") schedule();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    const iv = setInterval(schedule, 60_000);
    return () => {
      if (countTimer.current) clearTimeout(countTimer.current);
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      clearInterval(iv);
    };
  }, [supabase]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  // a página cheia da mensageria dispensa o botão flutuante
  if (pathname?.startsWith("/crm/mensagens")) return null;

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ "--chat-accent": accent } as React.CSSProperties}
        className="fixed bottom-[72px] right-4 z-[90] flex h-14 w-14 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg ring-4 ring-[var(--chat-accent)]/20 transition hover:scale-105 hover:shadow-xl active:scale-95 md:bottom-5 md:right-5"
        aria-label="OPS Chat"
        title="OPS Chat"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/symbol.svg" alt="OPS Chat" className="h-8 w-8" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--color-danger)] px-1.5 text-[11px] font-bold text-[var(--color-danger-foreground)] shadow">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="dock-backdrop fixed inset-0 z-[95] flex items-center justify-center bg-black/50 backdrop-blur-[2px] sm:p-4"
          onClick={() => setOpen(false)}
        >
          {/* mobile: tela cheia; desktop: modal 90% */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="dock-pop flex h-dvh w-screen overflow-hidden bg-[var(--color-surface)] shadow-2xl sm:h-[90vh] sm:w-[90vw] sm:rounded-[var(--radius-card)] sm:border sm:border-[var(--color-border-strong)]"
          >
            <ChatWorkspace
              currentUserId={currentUserId}
              userName={userName}
              variant="modal"
              onClose={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
