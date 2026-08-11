import {
  Ban,
  HandCoins,
  Link2,
  Repeat,
  Send,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { currencyBRL } from "@/lib/utils/ui";
import {
  cancelCharge,
  resendChargeLink,
} from "@/app/(dashboard)/vendas/actions";
import { dt } from "./helpers";
import { PAY_META, type PaymentRow, type SaleRow } from "./types";

export function SaleRowItem({
  sale: s,
  pays,
  busy,
  setBusy,
  startTransition,
  onEncerrar,
}: {
  sale: SaleRow;
  pays: PaymentRow[];
  busy: string | null;
  setBusy: (id: string | null) => void;
  startTransition: (fn: () => void) => void;
  onEncerrar: (s: SaleRow) => void;
}) {
  const pagas = pays.filter((p) => p.status === "pago").length;
  const proxima = [...pays]
    .reverse()
    .find((p) => p.status === "pendente" || p.status === "atrasado");
  const unica = pays.length === 1 ? pays[0] : null;
  const fatura =
    proxima?.invoice_url ?? pays.find((p) => p.invoice_url)?.invoice_url;

  const st = unica
    ? unica.status
    : proxima
    ? proxima.status
    : pagas === pays.length && pays.length > 0
    ? "pago"
    : null;

  const pendente = unica ?? proxima;
  const showChargeActions =
    pendente &&
    (pendente.status === "pendente" || pendente.status === "atrasado");

  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-[var(--color-border)]/60 py-2.5 text-sm last:border-0">
      {s.kind === "recorrente" ? (
        <span
          title="Assinatura mensal"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
        >
          <Repeat className="h-3.5 w-3.5" />
        </span>
      ) : (
        <span
          title="Cobrança avulsa"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-2)] text-[var(--color-muted)]"
        >
          <HandCoins className="h-3.5 w-3.5" />
        </span>
      )}
      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate font-medium">{s.description}</p>
        <p className="text-[11px] text-[var(--color-muted-2)]">
          {s.kind === "recorrente"
            ? `mensal · dia ${s.billing_day ?? "—"} · ${pagas}/${pays.length} pagas${
                s.status !== "ativa" ? " · encerrada" : ""
              }`
            : unica
            ? unica.status === "pago"
              ? `paga em ${dt(unica.paid_at)}`
              : `vence ${dt(unica.due_date)}`
            : dt(s.started_at)}
        </p>
      </div>
      <span className="font-semibold tabular-nums">
        {currencyBRL(Number(s.value))}
        {s.kind === "recorrente" && (
          <span className="text-xs font-normal text-[var(--color-muted-2)]">
            /mês
          </span>
        )}
      </span>
      {st && (
        <Badge tone={PAY_META[st].tone} size="sm">
          {PAY_META[st].label}
        </Badge>
      )}
      <div className="flex items-center gap-1">
        {fatura && (
          <button
            title="Copiar link da fatura"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(fatura);
              toast("Link da fatura copiado.");
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)]"
          >
            <Link2 className="h-3.5 w-3.5" />
          </button>
        )}
        {showChargeActions && pendente && (
          <>
            <button
              title="Reenviar fatura pelo WhatsApp"
              disabled={busy === pendente.id}
              onClick={(e) => {
                e.stopPropagation();
                setBusy(pendente.id);
                startTransition(async () => {
                  const r = await resendChargeLink(pendente.id);
                  setBusy(null);
                  if (r?.error) toast(r.error, { type: "error" });
                  else toast("Segunda via enviada no WhatsApp.");
                });
              }}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)] disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
            <button
              title="Cancelar cobrança (no Asaas também)"
              disabled={busy === pendente.id}
              onClick={(e) => {
                e.stopPropagation();
                if (
                  !confirm(
                    `Cancelar a cobrança de ${currencyBRL(
                      Number(pendente.value ?? 0)
                    )} (vence ${dt(pendente.due_date)})?\n\nEla será excluída no Asaas e o link para de funcionar.`
                  )
                )
                  return;
                setBusy(pendente.id);
                startTransition(async () => {
                  const r = await cancelCharge(pendente.id);
                  setBusy(null);
                  if (r?.error) toast(r.error, { type: "error" });
                  else toast("Cobrança cancelada aqui e no Asaas.");
                });
              }}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)] disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        {s.kind === "recorrente" && s.status === "ativa" && (
          <button
            title="Encerrar assinatura"
            disabled={busy === s.id}
            onClick={(e) => {
              e.stopPropagation();
              onEncerrar(s);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)] disabled:opacity-40"
          >
            <Ban className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
