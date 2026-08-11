"use client";

/** Empty state da coluna do meio quando nenhuma conversa está aberta. */
export function EmptyState() {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden bg-[var(--color-background)] px-8 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, var(--chat-accent) 0, transparent 28%), radial-gradient(circle at 80% 70%, var(--color-primary) 0, transparent 26%)",
        }}
      />
      <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--chat-accent)]/12">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/symbol.svg" alt="" className="h-10 w-10" />
      </div>
      <div className="relative max-w-sm">
        <p className="text-xl font-semibold tracking-tight">OPS Chat</p>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Conecte, converse e monitore o WhatsApp com histórico contínuo do CRM
          e sessões de atendimento quando precisar.
        </p>
      </div>
    </div>
  );
}
