"use client";

import { Camera, FileText, ImagePlus, Loader2, Paperclip } from "lucide-react";

/**
 * Clipe de anexo estilo WhatsApp: abre um MENU (fotos/vídeos, documento,
 * câmera) e cada opção dispara o seletor de arquivo certo.
 */
export function AttachMenu({
  open,
  onToggle,
  onClose,
  disabled,
  uploading,
  refs,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  disabled: boolean;
  uploading: boolean;
  refs: {
    photo: React.RefObject<HTMLInputElement | null>;
    doc: React.RefObject<HTMLInputElement | null>;
    cam: React.RefObject<HTMLInputElement | null>;
  };
}) {
  const options = [
    { label: "Fotos e vídeos", icon: ImagePlus, color: "#1d6fff", ref: refs.photo },
    { label: "Documento", icon: FileText, color: "#a78bfa", ref: refs.doc },
    { label: "Câmera", icon: Camera, color: "#f472b6", ref: refs.cam },
  ] as const;

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        disabled={disabled}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border-strong)] transition disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
          open
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
            className={`h-4 w-4 transition-transform ${open ? "rotate-45" : ""}`}
          />
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={onClose} />
          <div className="absolute bottom-12 left-0 z-20 w-52 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-1.5 shadow-xl">
            {options.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.label}
                  onClick={() => {
                    onClose();
                    opt.ref.current?.click();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                >
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${opt.color}1c` }}
                  >
                    <Icon className="h-4 w-4" style={{ color: opt.color }} />
                  </span>
                  {opt.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
