import { HandCoins, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils/ui";

export function SalesHeader({
  showForm,
  setShowForm,
}: {
  showForm: boolean;
  setShowForm: (v: boolean | ((prev: boolean) => boolean)) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <HandCoins className="h-5 w-5 text-[var(--color-primary)]" />
          Vendas
        </h1>
        <p className="mt-0.5 text-xs text-[var(--color-muted-2)]">
          Receita por cliente — cobranças sincronizadas com o Asaas
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
            Nova cobrança
          </>
        )}
      </button>
    </div>
  );
}
