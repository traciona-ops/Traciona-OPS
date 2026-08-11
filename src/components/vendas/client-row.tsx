import { ChevronDown } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, currencyBRL } from "@/lib/utils/ui";
import { dt } from "./helpers";
import { SaleRowItem } from "./sale-row";
import type { ClientGroup, PaymentRow, SaleRow } from "./types";

export function ClientRow({
  group: g,
  open,
  onToggle,
  paysBySale,
  busy,
  setBusy,
  startTransition,
  onEncerrar,
}: {
  group: ClientGroup;
  open: boolean;
  onToggle: () => void;
  paysBySale: Map<string, PaymentRow[]>;
  busy: string | null;
  setBusy: (id: string | null) => void;
  startTransition: (fn: () => void) => void;
  onEncerrar: (s: SaleRow) => void;
}) {
  return (
    <div className="border-b border-[var(--color-border)] last:border-0">
      <div
        onClick={onToggle}
        className={cn(
          "flex cursor-pointer flex-wrap items-center gap-3 p-3.5 transition hover:bg-[var(--color-surface-2)]/40",
          open && "bg-[var(--color-surface-2)]/40"
        )}
      >
        <Avatar name={g.lead.name} src={g.lead.avatar_url} size={42} />
        <div className="min-w-0 flex-1 basis-52">
          <p className="truncate text-sm font-semibold">{g.lead.name}</p>
          <p className="truncate text-xs text-[var(--color-muted)]">
            {g.cobrancas} cobrança{g.cobrancas === 1 ? "" : "s"}
            {g.ultima && ` · última em ${dt(g.ultima)}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold tabular-nums text-[var(--color-success)]">
            {currencyBRL(g.totalPago)}
          </p>
          <p className="text-[11px] text-[var(--color-muted-2)]">recebido</p>
        </div>
        {g.temAtraso ? (
          <Badge tone="danger">Em atraso</Badge>
        ) : g.temAssinaturaAtiva ? (
          <Badge tone="success">Assinatura ativa</Badge>
        ) : (
          <Badge tone="neutral">Histórico</Badge>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[var(--color-muted-2)] transition-transform",
            open && "rotate-180"
          )}
        />
      </div>

      {open && (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/30 px-4 py-2">
          {g.sales.map((s) => (
            <SaleRowItem
              key={s.id}
              sale={s}
              pays={paysBySale.get(s.id) ?? []}
              busy={busy}
              setBusy={setBusy}
              startTransition={startTransition}
              onEncerrar={onEncerrar}
            />
          ))}
        </div>
      )}
    </div>
  );
}
