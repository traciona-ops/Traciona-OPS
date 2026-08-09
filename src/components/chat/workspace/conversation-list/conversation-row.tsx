"use client";

import {
  FileText,
  Image as ImageIcon,
  Mic,
  Shapes,
  Video,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { fmtTimeBR, relativeDayBR } from "@/lib/utils/dates";
import { SECTOR } from "@/lib/data/labels";
import type { Conv } from "@/components/chat/types";

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
  return s.replace(/\*([^*\n]+)\*/g, "$1").replace(/_([^_\n]+)_/g, "$1");
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

/** Hoje mostra a hora; antes disso, o dia relativo. */
function listStamp(iso: string) {
  const label = relativeDayBR(iso);
  return label === "Hoje" ? fmtTimeBR(iso) : label;
}

export function ConversationRow({
  conv,
  active,
  typing,
  onOpen,
}: {
  conv: Conv;
  active: boolean;
  typing: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className={`relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
        active ? "bg-[var(--color-primary)]/8" : "hover:bg-[var(--color-surface-2)]"
      }`}
    >
      {active && (
        <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[var(--color-primary)]" />
      )}
      <Avatar name={conv.name} src={conv.avatar_url} size={42} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={`flex min-w-0 items-center gap-1.5 truncate text-[13px] ${
              conv.unread > 0
                ? "font-semibold text-[var(--color-foreground)]"
                : "font-medium"
            }`}
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{
                backgroundColor:
                  SECTOR[conv.sector]?.color ?? "var(--color-muted-2)",
              }}
              title={SECTOR[conv.sector]?.label}
            />
            <span className="truncate">{conv.name}</span>
          </p>
          <span
            className={`shrink-0 text-[11px] ${
              conv.unread > 0
                ? "font-semibold text-[var(--chat-accent)]"
                : "text-[var(--color-muted-2)]"
            }`}
          >
            {conv.last_at ? listStamp(conv.last_at) : ""}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          {typing ? (
            <p className="truncate text-xs font-medium italic text-[var(--color-success)]">
              digitando…
            </p>
          ) : (
            <ConvPreview
              body={conv.last_body}
              mediaType={conv.last_media_type}
              out={conv.last_direction === "out"}
            />
          )}
          <span className="flex shrink-0 items-center gap-1.5">
            {!conv.in_pipeline && (
              <span
                className="rounded bg-[color-mix(in_srgb,var(--color-warning)_15%,var(--color-surface))] px-1 py-px text-[11px] font-semibold text-[var(--color-warning)]"
                title="Só no chat — sem card no funil"
              >
                sem card
              </span>
            )}
            {conv.owner_name && (
              <span title={`Responsável: ${conv.owner_name}`}>
                <Avatar name={conv.owner_name} size={16} />
              </span>
            )}
            {conv.unread > 0 && (
              <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--chat-accent)] px-1 text-[11px] font-bold text-[var(--color-primary-foreground)]">
                {conv.unread > 99 ? "99+" : conv.unread}
              </span>
            )}
          </span>
        </div>
      </div>
    </button>
  );
}
