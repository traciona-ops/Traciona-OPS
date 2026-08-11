"use client";

import {
  FileSignature,
  FilePen,
  FileCheck2,
  FileX2,
  Clock,
  Plus,
  X,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { cn, currencyBRL } from "@/lib/utils/ui";
import type { Filter } from "./types";

type ContractsHeaderProps = {
  filter: Filter;
  setFilter: (f: Filter) => void;
  counts: Record<string, number>;
  valorAssinado: number;
  showForm: boolean;
  setShowForm: (v: boolean | ((prev: boolean) => boolean)) => void;
  integrationReady: boolean;
  notice: string | null;
  setNotice: (n: string | null) => void;
};

export function ContractsHeader({
  filter,
  setFilter,
  counts,
  valorAssinado,
  showForm,
  setShowForm,
  integrationReady,
  notice,
  setNotice,
}: ContractsHeaderProps) {
  const tiles: { key: Filter; label: string; icon: LucideIcon; sub?: string }[] =
    [
      { key: "todos", label: "Todos", icon: FileSignature },
      { key: "rascunho", label: "Rascunhos", icon: FilePen },
      { key: "enviado", label: "Aguardando", icon: Clock },
      {
        key: "assinado",
        label: "Assinados",
        icon: FileCheck2,
        sub: valorAssinado > 0 ? currencyBRL(valorAssinado) : undefined,
      },
      { key: "recusado", label: "Recusados", icon: FileX2 },
    ];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <FileSignature className="h-5 w-5 text-[var(--color-primary)]" />
            Contratos
          </h1>
          <p className="mt-0.5 text-xs text-[var(--color-muted-2)]">
            Do envio à assinatura digital, sem sair do sistema
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className={cn(
            "ml-auto flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-medium transition",
            showForm
              ? "border border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
              : "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-sm hover:opacity-90"
          )}
        >
          {showForm ? (
            <>
              <X className="h-4 w-4" />
              Fechar
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Novo contrato
            </>
          )}
        </button>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => {
          const active = filter === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={cn(
                "card flex flex-col gap-1.5 rounded-2xl p-3.5 text-left transition",
                active
                  ? "ring-2 ring-[var(--color-primary)]"
                  : "hover:bg-[var(--color-surface-2)]/50"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--color-muted)]">
                  {t.label}
                </span>
                <Icon
                  className={cn(
                    "h-4 w-4",
                    active
                      ? "text-[var(--color-primary)]"
                      : "text-[var(--color-muted-2)]"
                  )}
                />
              </div>
              <span className="text-2xl font-semibold tabular-nums leading-none">
                {counts[t.key] ?? 0}
              </span>
              {t.sub && (
                <span className="text-[11px] font-medium text-[var(--color-success)]">
                  {t.sub}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!integrationReady && (
        <div className="mb-5 rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-4 py-3 text-sm text-[var(--color-warning)]">
          <strong>Autentique aguardando token.</strong> Você já pode criar
          contratos; o envio pra assinatura ativa quando o token da API for
          configurado.
        </div>
      )}

      {notice && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-[var(--color-success)]/25 bg-[var(--color-success)]/8 px-4 py-3 text-sm text-[var(--color-success)]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{notice}</span>
          <button
            onClick={() => setNotice(null)}
            aria-label="Fechar aviso"
            className="text-[var(--color-success)]/60 transition hover:text-[var(--color-success)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}
