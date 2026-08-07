"use client";

import { useEffect, useState } from "react";
import { Check, TriangleAlert, X } from "lucide-react";

// Toast sem dependência: emissor global + <Toaster/> montado no layout.
// Uso: toast("Card movido", { action: { label: "Desfazer", onClick } })
//      toast("Não deu", { type: "error" })

export type ToastAction = { label: string; onClick: () => void };
export type ToastItem = {
  id: number;
  message: string;
  type: "success" | "error";
  action?: ToastAction;
  duration: number;
};

type Listener = (t: ToastItem) => void;
let listener: Listener | null = null;
let seq = 1;

export function toast(
  message: string,
  opts: {
    type?: "success" | "error";
    action?: ToastAction;
    duration?: number;
  } = {}
) {
  listener?.({
    id: seq++,
    message,
    type: opts.type ?? "success",
    action: opts.action,
    duration: opts.duration ?? (opts.action ? 6000 : 3500),
  });
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    listener = (t) => {
      setItems((prev) => [...prev.slice(-3), t]);
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== t.id));
      }, t.duration);
    };
    return () => {
      listener = null;
    };
  }, []);

  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm shadow-xl"
        >
          {t.type === "error" ? (
            <TriangleAlert className="h-4 w-4 shrink-0 text-[var(--color-danger)]" />
          ) : (
            <Check className="h-4 w-4 shrink-0 text-[var(--color-success)]" />
          )}
          <span className="min-w-0 flex-1">{t.message}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.onClick();
                setItems((prev) => prev.filter((x) => x.id !== t.id));
              }}
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
            >
              {t.action.label}
            </button>
          )}
          <button
            onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
            className="shrink-0 text-[var(--color-muted-2)] hover:text-[var(--color-foreground)]"
            aria-label="Fechar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
