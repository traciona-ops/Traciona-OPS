"use client";

import { useMemo } from "react";
import { FileText, Loader2, Send, X } from "lucide-react";

/** Prévia do arquivo escolhido com campo de legenda, antes de subir. */
export function MediaPreviewDialog({
  file,
  caption,
  onCaption,
  uploading,
  onCancel,
  onSend,
}: {
  file: File;
  caption: string;
  onCaption: (v: string) => void;
  uploading: boolean;
  onCancel: () => void;
  onSend: () => void;
}) {
  const previewUrl = useMemo(
    () => (file.type.startsWith("image/") ? URL.createObjectURL(file) : null),
    [file]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => !uploading && onCancel()}
    >
      <div className="card w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold">Enviar arquivo</span>
          <button
            onClick={onCancel}
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
            <span className="truncate">{file.name}</span>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            value={caption}
            onChange={(e) => onCaption(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Legenda (opcional)"
            autoFocus
            className="h-10 flex-1 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none"
          />
          <button
            onClick={onSend}
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
  );
}
