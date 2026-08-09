"use client";

import { WhatsAppIcon } from "@/components/whatsapp-icon";

/** Nenhuma conversa aberta ainda (coluna do meio, no desktop). */
export function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-[var(--color-background)] text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-card)] bg-[var(--chat-accent)]/10">
        <WhatsAppIcon className="h-9 w-9 text-[var(--chat-accent)]" />
      </div>
      <div>
        <p className="text-sm font-medium">Suas conversas do WhatsApp</p>
        <p className="mt-1 px-8 text-xs text-[var(--color-muted-2)]">
          Selecione uma conversa ao lado ou comece uma nova com o botão de
          escrever lá em cima.
        </p>
      </div>
    </div>
  );
}
