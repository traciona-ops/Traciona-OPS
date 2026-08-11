"use client";

import { useState } from "react";
import { ArrowLeft, ChevronRight, Palette, Smartphone, Zap, type LucideIcon } from "lucide-react";
import { NumbersSection } from "@/components/chat/workspace/settings/numbers-section";
import { QuickRepliesSection } from "@/components/chat/workspace/settings/quick-replies-section";
import { AppearanceSection } from "@/components/chat/workspace/settings/appearance-section";

type Tab = "menu" | "numero" | "rapidas" | "prefs";

/**
 * Central de configurações do chat (estilo Groner).
 * Menu → Números / Mensagens rápidas / Preferências.
 */
export function ChatSettings({
  isAdmin,
  connected,
  accent,
  onAccent,
  onClose,
  onOpenQueues,
}: {
  isAdmin: boolean;
  connected: boolean;
  accent: string;
  onAccent: (c: string) => void;
  onClose: () => void;
  onOpenQueues?: () => void;
}) {
  const [tab, setTab] = useState<Tab>(isAdmin ? "numero" : "menu");

  const items = (
    [
      isAdmin
        ? {
            key: "numero" as const,
            icon: Smartphone,
            title: "Números",
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
        ? "Números"
        : tab === "rapidas"
          ? "Mensagens Rápidas"
          : "Preferências";

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-[var(--color-background)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <button
          type="button"
          onClick={() => (tab === "menu" ? onClose() : setTab("menu"))}
          aria-label="Voltar"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="text-sm font-semibold">{heading}</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "menu" && (
          <div className="mx-auto max-w-lg overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className="flex w-full items-center gap-3 border-b border-[var(--color-border)]/60 px-4 py-3.5 text-left last:border-b-0 hover:bg-[var(--color-surface-2)]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--chat-accent)]/10">
                    <Icon className="h-[18px] w-[18px] text-[var(--chat-accent)]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{item.title}</span>
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

        {tab === "numero" && isAdmin && (
          <div className="mx-auto max-w-5xl">
            <NumbersSection connected={connected} onOpenQueues={onOpenQueues} />
          </div>
        )}
        {tab === "rapidas" && (
          <div className="mx-auto max-w-lg">
            <QuickRepliesSection />
          </div>
        )}
        {tab === "prefs" && (
          <div className="mx-auto max-w-lg">
            <AppearanceSection accent={accent} onAccent={onAccent} />
          </div>
        )}
      </div>
    </div>
  );
}
