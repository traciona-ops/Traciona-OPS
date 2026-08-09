"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Power, QrCode, RefreshCw, Unlink } from "lucide-react";
import { WhatsAppIcon } from "@/components/whatsapp-icon";
import { formatPhone } from "@/lib/utils/ui";
import {
  getWhatsappState,
  connectWhatsapp,
  disconnectWhatsapp,
  logoutWhatsapp,
  requestChatHistory,
} from "@/app/(dashboard)/settings/actions";

const SYNC_KEY = "traciona:wa:last_sync_at";

/**
 * Status da Sessão do WhatsApp (estilo painel DinastiAPI): chips de
 * Conectado/Autenticado, número pareado, barra de ações e rodapé de status.
 * Usada nas Configurações e nas preferências do OPS Chat.
 */
export function WhatsappConnect({
  initialConnected,
  embedded = false,
  numberId,
}: {
  initialConnected: boolean;
  /** true = dentro do popup do chat (sem moldura de card). */
  embedded?: boolean;
  /** id em wa_numbers pra instâncias extras; undefined = número principal. */
  numberId?: string;
}) {
  const [connected, setConnected] = useState(initialConnected);
  const [loggedIn, setLoggedIn] = useState(initialConnected);
  const [jid, setJid] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const applyState = useCallback(
    (s: Awaited<ReturnType<typeof getWhatsappState>>) => {
      if (!("connected" in s)) return false;
      setConnected(!!s.connected);
      setLoggedIn(!!s.loggedIn);
      setJid(s.jid ?? null);
      return !!(s.connected && s.loggedIn);
    },
    []
  );

  // O status inicial vindo por prop pode estar velho (ex.: painel aberto antes
  // de qualquer conversa). Confere o status REAL na montagem.
  useEffect(() => {
    let alive = true;
    getWhatsappState(numberId).then((s) => {
      if (alive) applyState(s);
    });
    return () => {
      alive = false;
    };
  }, [applyState, numberId]);

  const stopPolling = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // Lê status (que já traz o QR durante o pareamento). Se não tiver QR e não
  // estiver logado, re-emite connect pra (re)gerar o client/QR.
  async function poll() {
    const s = await getWhatsappState(numberId);
    if (!("connected" in s)) return;
    if (applyState(s)) {
      setConnecting(false);
      setQr(null);
      stopPolling();
      return;
    }
    if (s.qr) setQr(s.qr);
    else await connectWhatsapp(numberId);
  }

  async function refresh() {
    setRefreshing(true);
    const s = await getWhatsappState(numberId);
    applyState(s);
    setRefreshing(false);
  }

  async function startConnect() {
    setError(null);
    setBusy(true);
    const c = await connectWhatsapp(numberId);
    setBusy(false);
    if (c && "error" in c) {
      // "already connected" não é erro — a sessão já está de pé
      if (/already/i.test(c.error ?? "")) {
        await poll();
        return;
      }
      setError(c.error ?? "Falha ao conectar.");
      return;
    }
    setConnecting(true);
    await poll();
    stopPolling();
    timer.current = setInterval(poll, 3000);
  }

  function cancelConnect() {
    setConnecting(false);
    setQr(null);
    stopPolling();
  }

  async function disconnect() {
    setBusy(true);
    await disconnectWhatsapp(numberId);
    setBusy(false);
    setConnected(false);
    setLoggedIn(false);
  }

  async function logout() {
    if (
      !confirm(
        "Desvincular o WhatsApp? Vai precisar escanear o QR de novo pra reconectar."
      )
    )
      return;
    setBusy(true);
    await logoutWhatsapp(numberId);
    setBusy(false);
    setConnected(false);
    setLoggedIn(false);
    setJid(null);
    setQr(null);
  }

  // Histórico dos últimos 30 dias: pedido AUTOMÁTICO ao conectar (1x/24h),
  // sem nenhuma UI — roda invisível, as conversas chegam pelo webhook.
  const syncFiredRef = useRef(false);
  useEffect(() => {
    // histórico automático só pro número principal
    if (!connected || syncFiredRef.current || numberId) return;
    syncFiredRef.current = true;
    if (typeof window !== "undefined") {
      const at = localStorage.getItem(SYNC_KEY);
      if (at) {
        const ageH = (Date.now() - new Date(at).getTime()) / 3600_000;
        if (ageH < 24) return;
      }
      localStorage.setItem(SYNC_KEY, new Date().toISOString());
    }
    void requestChatHistory();
  }, [connected]);

  const online = connected && loggedIn;
  const phoneDigits = jid ? jid.split("@")[0].split(":")[0] : null;

  const btn =
    "flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] px-3 text-xs font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] disabled:opacity-50";

  const body = (
    <>
      {/* cabeçalho: título numa linha; chips quebram pra baixo se faltar espaço */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--chat-accent,var(--color-primary))]/12">
            <WhatsAppIcon className="h-5 w-5 text-[var(--chat-accent,var(--color-primary))]" />
          </div>
          <div className="min-w-0">
            <h2 className="whitespace-nowrap text-sm font-semibold leading-tight">
              Status da Sessão
            </h2>
            <p className="truncate text-[11px] leading-tight text-[var(--color-muted-2)]">
              {phoneDigits
                ? formatPhone(phoneDigits)
                : online
                ? "Número conectado e operando"
                : connecting
                ? "Aguardando pareamento…"
                : "Nenhum número conectado"}
            </p>
          </div>
        </div>
        {/* chips estilo DinastiAPI: Conectado + Autenticado */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              connected
                ? "bg-[var(--color-success)]/12 text-[var(--color-success)]"
                : "bg-[var(--color-danger)]/10 text-[var(--color-danger)]"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                connected
                  ? "animate-pulse bg-[var(--color-success)]"
                  : "bg-[var(--color-danger)]"
              }`}
            />
            {connected ? "Conectado" : "Desconectado"}
          </span>
          <span
            className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              loggedIn
                ? "bg-[var(--color-success)]/12 text-[var(--color-success)]"
                : "bg-[var(--color-surface-2)] text-[var(--color-muted-2)]"
            }`}
          >
            {loggedIn ? "Autenticado" : "Não autenticado"}
          </span>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {online ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button onClick={refresh} disabled={refreshing} className={btn}>
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            Atualizar
          </button>
          <button onClick={disconnect} disabled={busy} className={btn}>
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Power className="h-3.5 w-3.5" />
            )}
            Desconectar
          </button>
          <button
            onClick={logout}
            disabled={busy}
            className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-[var(--color-danger)] transition hover:bg-[var(--color-danger)]/10 disabled:opacity-50"
          >
            <Unlink className="h-3.5 w-3.5" />
            Desvincular
          </button>
        </div>
      ) : connecting ? (
        <div className="mt-5 flex flex-col items-center gap-4 text-center">
          {/* fundo branco de propósito: é o contêiner do QR code, precisa do contraste real pra câmera do celular ler — não segue o tema escuro */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-3 shadow-sm">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR code do WhatsApp" className="h-52 w-52" />
            ) : (
              <div className="flex h-52 w-52 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted)]" />
              </div>
            )}
          </div>
          <ol className="space-y-1 text-left text-xs text-[var(--color-muted)]">
            <li>
              <b className="text-[var(--color-foreground)]">1.</b> Abra o
              WhatsApp no celular
            </li>
            <li>
              <b className="text-[var(--color-foreground)]">2.</b> Toque em{" "}
              <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b>
            </li>
            <li>
              <b className="text-[var(--color-foreground)]">3.</b> Aponte a
              câmera pro QR acima
            </li>
          </ol>
          <button
            onClick={cancelConnect}
            className="text-xs font-medium text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={startConnect}
            disabled={busy}
            className="flex h-10 items-center gap-2 rounded-xl bg-[var(--chat-accent,var(--color-primary))] px-5 text-sm font-semibold text-[var(--color-primary-foreground)] shadow-sm transition hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <QrCode className="h-4 w-4" />
            )}
            Conectar via QR Code
          </button>
          <button onClick={refresh} disabled={refreshing} className={btn}>
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            Atualizar
          </button>
        </div>
      )}

      {/* rodapé de status (estilo DinastiAPI) */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--color-border)] pt-3 text-[11px] text-[var(--color-muted-2)]">
        <span>
          Conectado:{" "}
          <b
            className={
              connected
                ? "text-[var(--color-success)]"
                : "text-[var(--color-danger)]"
            }
          >
            {connected ? "Sim" : "Não"}
          </b>
        </span>
        <span>
          Autenticado:{" "}
          <b
            className={
              loggedIn
                ? "text-[var(--color-success)]"
                : "text-[var(--color-danger)]"
            }
          >
            {loggedIn ? "Sim" : "Não"}
          </b>
        </span>
        {jid && (
          <span className="min-w-0 truncate">
            JID:{" "}
            <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono">
              {jid}
            </span>
          </span>
        )}
      </div>
    </>
  );

  if (embedded) {
    return <div className="w-full max-w-md">{body}</div>;
  }
  return <section className="card p-5">{body}</section>;
}
