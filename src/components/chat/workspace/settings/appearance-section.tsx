"use client";

import { Check } from "lucide-react";
import { CHAT_ACCENTS } from "@/hooks/use-chat-accent";

/** Cor do chat — preferência local, não vai pro banco. */
export function AppearanceSection({
  accent,
  onAccent,
}: {
  accent: string;
  onAccent: (c: string) => void;
}) {
  return (
    <div className="card p-6">
      <h2 className="text-sm font-semibold">Cor do chat</h2>
      <p className="mt-0.5 text-[11px] text-[var(--color-muted-2)]">
        Só muda pra você, neste navegador.
      </p>
      <div className="mt-3 flex flex-wrap gap-2.5">
        {CHAT_ACCENTS.map((a) => (
          <button
            key={a.color}
            onClick={() => onAccent(a.color)}
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
  );
}
