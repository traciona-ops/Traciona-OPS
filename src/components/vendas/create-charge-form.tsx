import { Send } from "lucide-react";
import { cn } from "@/lib/utils/ui";
import { maskCpf, maskCnpj } from "@/lib/utils/masks";
import type { LeadOption } from "./types";

export function CreateChargeForm({
  formRef,
  onSubmit,
  kind,
  setKind,
  leads,
  busy,
  integrationReady,
  setShowForm,
}: {
  formRef: React.RefObject<HTMLFormElement | null>;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  kind: "avulsa" | "recorrente";
  setKind: (k: "avulsa" | "recorrente") => void;
  leads: LeadOption[];
  busy: string | null;
  integrationReady: boolean;
  setShowForm: (v: boolean) => void;
}) {
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="card mb-5 rounded-2xl p-4"
    >
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setKind("avulsa")}
          className={cn(
            "h-8 rounded-full px-3.5 text-xs font-medium transition-colors",
            kind === "avulsa"
              ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
              : "border border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
          )}
        >
          Cobrança avulsa
        </button>
        <button
          type="button"
          onClick={() => setKind("recorrente")}
          className={cn(
            "h-8 rounded-full px-3.5 text-xs font-medium transition-colors",
            kind === "recorrente"
              ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
              : "border border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
          )}
        >
          Assinatura mensal
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--color-muted)]">
          Cliente *
          <select
            name="lead_id"
            required
            className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]"
          >
            <option value="">Escolha o cliente...</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--color-muted)]">
          Descrição *
          <input
            name="description"
            required
            placeholder={
              kind === "recorrente"
                ? "Ex.: Assessoria de Marketing"
                : "Ex.: Criação de landing page"
            }
            className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--color-muted)]">
          Valor (R$) * {kind === "recorrente" ? "por mês" : ""}
          <input
            name="value"
            required
            inputMode="decimal"
            placeholder="1500,00"
            className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--color-muted)]">
          {kind === "recorrente"
            ? "Primeiro vencimento * (as próximas vêm nesse dia)"
            : "Vencimento *"}
          <input
            name="due_date"
            required
            type="date"
            className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--color-muted)] sm:col-span-2">
          CPF/CNPJ (só se o cliente ainda não estiver no Asaas)
          <input
            name="cpf_cnpj"
            inputMode="numeric"
            placeholder="000.000.000-00 ou 00.000.000/0000-00"
            onChange={(e) => {
              const d = e.currentTarget.value.replace(/\D/g, "");
              e.currentTarget.value =
                d.length > 11
                  ? maskCnpj(e.currentTarget.value)
                  : maskCpf(e.currentTarget.value);
            }}
            className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]"
          />
        </label>
      </div>
      <div className="mt-4 flex items-center justify-end gap-2.5 border-t border-[var(--color-border)] pt-4">
        <button
          type="button"
          onClick={() => setShowForm(false)}
          className="h-10 px-3 text-sm text-[var(--color-muted)] transition hover:text-[var(--color-foreground)]"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={busy === "new" || !integrationReady}
          className="flex h-10 items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-5 text-sm font-medium text-[var(--color-primary-foreground)] shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {busy === "new"
            ? "Criando no Asaas..."
            : "Criar e enviar no WhatsApp"}
        </button>
      </div>
    </form>
  );
}
