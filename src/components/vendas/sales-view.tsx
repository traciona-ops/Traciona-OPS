"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "@/components/ui/toast";
import {
  createManualCharge,
  endSale,
} from "@/app/(dashboard)/vendas/actions";
import { ClientsList } from "./clients-list";
import { CreateChargeForm } from "./create-charge-form";
import { IntegrationNotice } from "./integration-notice";
import { SalesFilters } from "./sales-filters";
import { SalesHeader } from "./sales-header";
import { SalesKpis } from "./sales-kpis";
import { useFilteredClients, useSalesData } from "./use-sales-data";
import type { Filter, SaleRow, SalesViewProps } from "./types";

export type { LeadOption, PaymentRow, SaleRow } from "./types";

export function SalesView({
  sales,
  payments,
  leads,
  balance,
  integrationReady,
}: SalesViewProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [openClient, setOpenClient] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<"avulsa" | "recorrente">("avulsa");
  const [filter, setFilter] = useState<Filter>("todos");
  const [q, setQ] = useState("");
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const { paysBySale, clients, kpis, meses, counts } = useSalesData(
    sales,
    payments
  );
  const filteredClients = useFilteredClients(clients, filter, q);

  async function submitCharge(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.set("kind", kind);
    setBusy("new");
    const r = await createManualCharge(form);
    setBusy(null);
    if (r?.error) {
      toast(r.error, { type: "error" });
      return;
    }
    formRef.current?.reset();
    setShowForm(false);
    toast(
      r.whatsapp
        ? "Cobrança criada no Asaas e link enviado no WhatsApp do cliente."
        : "Cobrança criada no Asaas."
    );
  }

  function encerrar(s: SaleRow) {
    if (
      !confirm(
        `Encerrar "${s.description}"?\n\nAs cobranças futuras no Asaas serão canceladas. As já emitidas continuam valendo.`
      )
    )
      return;
    setBusy(s.id);
    startTransition(async () => {
      const r = await endSale(s.id);
      setBusy(null);
      if (r?.error) toast(r.error, { type: "error" });
      else toast("Venda encerrada — cobranças futuras canceladas.");
    });
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <SalesHeader showForm={showForm} setShowForm={setShowForm} />

        <SalesKpis kpis={kpis} balance={balance} meses={meses} />

        <SalesFilters
          filter={filter}
          setFilter={setFilter}
          counts={counts}
          kpis={kpis}
          q={q}
          setQ={setQ}
        />

        {showForm && (
          <CreateChargeForm
            formRef={formRef}
            onSubmit={submitCharge}
            kind={kind}
            setKind={setKind}
            leads={leads}
            busy={busy}
            integrationReady={integrationReady}
            setShowForm={setShowForm}
          />
        )}

        {!integrationReady && <IntegrationNotice />}

        <ClientsList
          clients={clients}
          filteredClients={filteredClients}
          openClient={openClient}
          setOpenClient={setOpenClient}
          paysBySale={paysBySale}
          busy={busy}
          setBusy={setBusy}
          startTransition={startTransition}
          onEncerrar={encerrar}
          q={q}
        />
      </div>
    </div>
  );
}
