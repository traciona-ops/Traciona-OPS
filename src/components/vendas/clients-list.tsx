import { HandCoins } from "lucide-react";
import { ClientRow } from "./client-row";
import type { ClientGroup, PaymentRow, SaleRow } from "./types";

export function ClientsList({
  clients,
  filteredClients,
  openClient,
  setOpenClient,
  paysBySale,
  busy,
  setBusy,
  startTransition,
  onEncerrar,
  q,
}: {
  clients: ClientGroup[];
  filteredClients: ClientGroup[];
  openClient: string | null;
  setOpenClient: (id: string | null) => void;
  paysBySale: Map<string, PaymentRow[]>;
  busy: string | null;
  setBusy: (id: string | null) => void;
  startTransition: (fn: () => void) => void;
  onEncerrar: (s: SaleRow) => void;
  q: string;
}) {
  if (filteredClients.length === 0 && clients.length > 0) {
    return (
      <div className="card flex flex-col items-center gap-2 rounded-2xl p-10 text-center">
        <HandCoins className="h-8 w-8 text-[var(--color-muted-2)]" />
        <p className="text-sm text-[var(--color-muted)]">
          {q
            ? "Nenhum cliente encontrado pra essa busca."
            : "Nenhum cliente nesse filtro."}
        </p>
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 rounded-2xl p-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <HandCoins className="h-7 w-7" />
        </div>
        <p className="text-sm font-medium">Nenhuma venda ainda</p>
        <p className="max-w-md text-sm text-[var(--color-muted)]">
          Quando um contrato for assinado, a venda aparece aqui sozinha — com a
          assinatura recorrente criada no Asaas e a primeira fatura enviada no
          WhatsApp do cliente.
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden rounded-2xl">
      {filteredClients.map((g) => {
        const aberto = openClient === g.lead.id;
        return (
          <ClientRow
            key={g.lead.id}
            group={g}
            open={aberto}
            onToggle={() => setOpenClient(aberto ? null : g.lead.id)}
            paysBySale={paysBySale}
            busy={busy}
            setBusy={setBusy}
            startTransition={startTransition}
            onEncerrar={onEncerrar}
          />
        );
      })}
    </div>
  );
}
