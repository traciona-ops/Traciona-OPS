"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "@/components/ui/toast";
import {
  createContract,
  createFormRequest,
  generateContractFromTemplate,
} from "@/app/(dashboard)/contratos/actions";
import { ContractsHeader } from "./contracts-header";
import { CreateContractForm } from "./create-contract-form";
import { FormRequestsPanel } from "./form-requests-panel";
import { ContractsList } from "./contracts-list";
import { STATUS_META } from "./status-meta";
import type {
  ContractsViewProps,
  Filter,
  Mode,
} from "./types";

export type {
  ContractRow,
  LeadOption,
  FormRequestRow,
} from "./types";

export function ContractsView({
  contracts,
  leads,
  formRequests,
  integrationReady,
}: ContractsViewProps) {
  const [filter, setFilter] = useState<Filter>("todos");
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<Mode>("opsform");
  const [tipoContrato, setTipoContrato] = useState<"pf" | "pj">("pf");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: contracts.length };
    for (const k of Object.keys(STATUS_META)) c[k] = 0;
    for (const r of contracts) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [contracts]);

  const valorAssinado = useMemo(
    () =>
      contracts
        .filter((c) => c.status === "assinado")
        .reduce((s, c) => s + Number(c.value ?? 0), 0),
    [contracts]
  );

  const list = useMemo(
    () =>
      filter === "todos"
        ? contracts
        : contracts.filter((c) => c.status === filter),
    [contracts, filter]
  );

  function run(id: string, fn: () => Promise<{ error?: string } | void>) {
    setBusy(id);
    setNotice(null);
    startTransition(async () => {
      const r = await fn();
      setBusy(null);
      if (r && "error" in r && r.error) toast(r.error, { type: "error" });
    });
  }

  async function submitNew(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy("new");
    const r =
      mode === "modelo"
        ? await generateContractFromTemplate(form)
        : mode === "opsform"
        ? await createFormRequest(form)
        : await createContract(form);
    setBusy(null);
    if (r?.error) {
      toast(r.error, { type: "error" });
      return;
    }
    formRef.current?.reset();
    setShowForm(false);
    if (mode === "modelo")
      setNotice(
        "Contrato gerado do modelo. Confira o PDF e, se estiver certo, envie pra assinatura."
      );
    if (mode === "opsform" && r && "url" in r)
      setNotice(
        (r as { whatsapp?: boolean }).whatsapp
          ? "OPS Form criado e enviado no WhatsApp do cliente. Quando ele responder, o contrato aparece aqui como rascunho, sozinho."
          : "OPS Form criado. O cliente não tem WhatsApp cadastrado — copie o link na lista abaixo e mande por onde preferir."
      );
    if (mode === "upload") setNotice("Contrato salvo como rascunho.");
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <ContractsHeader
          filter={filter}
          setFilter={setFilter}
          counts={counts}
          valorAssinado={valorAssinado}
          showForm={showForm}
          setShowForm={setShowForm}
          integrationReady={integrationReady}
          notice={notice}
          setNotice={setNotice}
        />

        {showForm && (
          <CreateContractForm
            formRef={formRef}
            onSubmit={submitNew}
            mode={mode}
            setMode={setMode}
            tipoContrato={tipoContrato}
            setTipoContrato={setTipoContrato}
            leads={leads}
            busy={busy}
            setShowForm={setShowForm}
          />
        )}

        <FormRequestsPanel
          formRequests={formRequests}
          busy={busy}
          run={run}
          setNotice={setNotice}
        />

        <ContractsList
          list={list}
          filter={filter}
          setShowForm={setShowForm}
          integrationReady={integrationReady}
          busy={busy}
          run={run}
          setNotice={setNotice}
        />
      </div>
    </div>
  );
}
