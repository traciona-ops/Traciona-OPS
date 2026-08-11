"use client";

import { ClipboardList, Link2, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  resendFormRequest,
  cancelFormRequest,
} from "@/app/(dashboard)/contratos/actions";
import type { FormRequestRow, RunFn } from "./types";

type FormRequestsPanelProps = {
  formRequests: FormRequestRow[];
  busy: string | null;
  run: RunFn;
  setNotice: (n: string | null) => void;
};

export function FormRequestsPanel({
  formRequests,
  busy,
  run,
  setNotice,
}: FormRequestsPanelProps) {
  if (formRequests.length === 0) return null;

  return (
    <div className="card mb-6 overflow-hidden rounded-2xl">
      <p className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-muted-2)]">
        <ClipboardList className="h-3.5 w-3.5" />
        OPS Forms enviados
      </p>
      {formRequests.map((f) => (
        <div
          key={f.id}
          className="flex flex-wrap items-center gap-2.5 border-b border-[var(--color-border)] px-4 py-2.5 last:border-0"
        >
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {f.lead?.name ?? "—"}
          </span>
          <span className="text-[11px] tabular-nums text-[var(--color-muted-2)]">
            {new Date(f.created_at).toLocaleDateString("pt-BR")}
          </span>
          <Badge tone={f.status === "respondido" ? "success" : "warning"}>
            {f.status === "respondido" ? "Respondido" : "Aguardando cliente"}
          </Badge>
          <div className="flex items-center gap-1">
            <button
              title="Copiar link do formulário"
              aria-label="Copiar link do formulário"
              onClick={() => {
                navigator.clipboard.writeText(
                  `${window.location.origin}/f/${f.token}`
                );
                setNotice("Link do OPS Form copiado.");
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            >
              <Link2 className="h-4 w-4" />
            </button>
            {f.status === "pendente" && (
              <>
                <button
                  title="Reenviar lembrete pelo WhatsApp"
                  aria-label="Reenviar lembrete pelo WhatsApp"
                  disabled={busy === f.id}
                  onClick={() =>
                    run(f.id, async () => {
                      const r = await resendFormRequest(f.id);
                      if (r?.error) return r;
                      setNotice("Lembrete reenviado no WhatsApp.");
                    })
                  }
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                >
                  <Send className="h-4 w-4" />
                </button>
                <button
                  title="Cancelar formulário"
                  aria-label="Cancelar formulário"
                  disabled={busy === f.id}
                  onClick={() => {
                    if (
                      confirm(
                        "Cancelar esse OPS Form? O link para de funcionar."
                      )
                    )
                      run(f.id, () => cancelFormRequest(f.id));
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
