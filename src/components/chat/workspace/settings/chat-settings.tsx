"use client";

import { useState } from "react";
import { ArrowLeft, ChevronRight, Palette, Smartphone, Zap, type LucideIcon } from "lucide-react";
import { NumbersSection } from "@/components/chat/workspace/settings/numbers-section";
import { QuickRepliesSection } from "@/components/chat/workspace/settings/quick-replies-section";
import { AppearanceSection } from "@/components/chat/workspace/settings/appearance-section";

type Tab = "menu" | "numero" | "rapidas" | "prefs";

/**
 * Central de configurações do chat (estilo Groner): um menu que abre seções.
 * Ocupa a coluna da conversa; o lado direito vira a vitrine do OPS Chat.
 */
export function ChatSettings({
  isAdmin,
  connected,
  accent,
  onAccent,
  onClose,
}: {
  isAdmin: boolean;
  connected: boolean;
  accent: string;
  onAccent: (c: string) => void;
  onClose: () => void;
}) {
  // monta só enquanto a central está aberta, então reabrir já cai no menu
  const [tab, setTab] = useState<Tab>("menu");

  const items = (
    [
      isAdmin
        ? {
            key: "numero" as const,
            icon: Smartphone,
            title: "Número",
            desc: connected ? "Conectado e operando" : "Desconectado",
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
      key: Exclude<Tab, "menu">;
      icon: LucideIcon;
      title: string;
      desc: string;
    }[]
  );

  const heading =
    tab === "menu"
      ? "Configurações"
      : tab === "numero"
      ? "Número"
      : tab === "rapidas"
      ? "Mensagens Rápidas"
      : "Preferências";

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* coluna ESQUERDA: central de configurações */}
      <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--color-surface)] sm:w-96 sm:shrink-0 sm:border-r sm:border-[var(--color-border)]">
        {/* ← volta pro menu (ou fecha a central) */}
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <button
            onClick={() => (tab === "menu" ? onClose() : setTab("menu"))}
            aria-label="Voltar"
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h2 className="text-sm font-semibold">{heading}</h2>
        </div>

        <div className="flex-1 overflow-y-auto bg-[var(--color-background)]">
          <div className="w-full space-y-4 p-4">
            {tab === "menu" && (
              <div className="card divide-y divide-[var(--color-border)]/60 overflow-hidden p-0">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      onClick={() => setTab(item.key)}
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

            {tab === "numero" && isAdmin && <NumbersSection connected={connected} />}
            {tab === "rapidas" && <QuickRepliesSection />}
            {tab === "prefs" && (
              <AppearanceSection accent={accent} onAccent={onAccent} />
            )}
          </div>
        </div>
      </div>

      {/* lado DIREITO: o chat some — fica a vitrine do OPS Chat */}
      <div className="hidden flex-1 flex-col items-center justify-center gap-3 bg-[var(--color-background)] text-center sm:flex">
        <div className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-card)] bg-[var(--chat-accent)]/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/symbol.svg" alt="OPS Chat" className="h-9 w-9" />
        </div>
        <div>
          <p className="text-lg font-semibold tracking-tight">OPS Chat</p>
          <p className="mt-1 px-8 text-xs text-[var(--color-muted-2)]">
            Conecte, converse e acompanhe — tudo integrado ao funil da Traciona.
          </p>
        </div>
      </div>
    </div>
  );
}
