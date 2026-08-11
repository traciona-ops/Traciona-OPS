"use client";

import {
  FileSignature,
  Plus,
  Send,
  RefreshCw,
  Link2,
  FileText,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, currencyBRL } from "@/lib/utils/ui";
import {
  sendContractForSignature,
  refreshContractStatus,
  getContractPdfUrl,
  closeContract,
  deleteContract,
} from "@/app/(dashboard)/contratos/actions";
import { STATUS_META } from "./status-meta";
import type { ContractRow, Filter, RunFn } from "./types";

type ContractsListProps = {
  list: ContractRow[];
  filter: Filter;
  setShowForm: (v: boolean) => void;
  integrationReady: boolean;
  busy: string | null;
  run: RunFn;
  setNotice: (n: string | null) => void;
};

function dt(s: string | null) {
  return s ? new Date(s).toLocaleDateString("pt-BR") : "—";
}

export function ContractsList({
  list,
  filter,
  setShowForm,
  integrationReady,
  busy,
  run,
  setNotice,
}: ContractsListProps) {
  if (list.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 rounded-2xl p-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <FileSignature className="h-7 w-7" />
        </div>
        {filter === "todos" ? (
          <>
            <p className="text-sm font-medium">Nenhum contrato por aqui ainda</p>
            <p className="max-w-sm text-sm text-[var(--color-muted)]">
              Crie o primeiro: o cliente preenche os dados pelo OPS Form, o PDF
              nasce sozinho e a assinatura vai pelo WhatsApp.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-1 flex h-10 items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] shadow-sm transition hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Criar primeiro contrato
            </button>
          </>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">
            Nenhum contrato com o status &quot;
            {STATUS_META[filter as ContractRow["status"]].label}&quot;.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="card overflow-hidden rounded-2xl">
      {list.map((c) => {
        const meta = STATUS_META[c.status];
        const StatusIcon = meta.icon;
        return (
          <div
            key={c.id}
            className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] p-3.5 last:border-0 hover:bg-[var(--color-surface-2)]/40"
          >
            <div className="relative shrink-0">
              <Avatar
                name={c.lead?.name ?? "?"}
                src={c.lead?.avatar_url}
                size={40}
              />
              <span
                className={cn(
                  "absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-md border-2 border-[var(--color-surface)]",
                  meta.iconBox
                )}
              >
                <StatusIcon className="h-3 w-3" />
              </span>
            </div>
            <div className="min-w-0 flex-1 basis-52">
              <p className="truncate text-sm font-medium">{c.title}</p>
              <p className="truncate text-xs text-[var(--color-muted)]">
                {c.lead?.name ?? "—"}
                {c.lead?.code != null && (
                  <span className="text-[var(--color-muted-2)]">
                    {" "}
                    · #{c.lead.code}
                  </span>
                )}
                {c.status === "enviado" && c.sent_at && (
                  <span className="text-[var(--color-muted-2)]">
                    {" "}
                    · enviado em {dt(c.sent_at)}
                  </span>
                )}
              </p>
            </div>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold tabular-nums">
                {c.value != null ? currencyBRL(Number(c.value)) : "—"}
              </p>
              <p className="text-[11px] tabular-nums text-[var(--color-muted-2)]">
                {dt(c.starts_at)} → {dt(c.ends_at)}
              </p>
            </div>
            <Badge tone={meta.tone} className="gap-1.5">
              <StatusIcon className="h-3 w-3" />
              {meta.label}
              {c.status === "assinado" && c.signed_at
                ? ` · ${dt(c.signed_at)}`
                : null}
            </Badge>
            <div className="flex items-center gap-1">
              {c.status === "rascunho" && (
                <button
                  title={
                    integrationReady
                      ? "Enviar pra assinatura (Autentique + WhatsApp)"
                      : "Aguardando token da Autentique"
                  }
                  aria-label={
                    integrationReady
                      ? "Enviar pra assinatura (Autentique + WhatsApp)"
                      : "Aguardando token da Autentique"
                  }
                  disabled={busy === c.id || !integrationReady}
                  onClick={() => {
                    const resumo = [
                      `Enviar pra assinatura?`,
                      ``,
                      `Contrato: ${c.title}`,
                      `Cliente: ${c.lead?.name ?? "—"}`,
                      c.value != null
                        ? `Valor: ${currencyBRL(Number(c.value))}`
                        : null,
                      `Vigência: ${dt(c.starts_at)} → ${dt(c.ends_at)}`,
                      ``,
                      `O link vai pelo WhatsApp${
                        c.signer_email
                          ? ` e por e-mail (${c.signer_email})`
                          : ""
                      }.`,
                    ]
                      .filter((l) => l !== null)
                      .join("\n");
                    if (!confirm(resumo)) return;
                    run(c.id, async () => {
                      const r = await sendContractForSignature(c.id);
                      if (r?.error) return r;
                      setNotice(
                        r.whatsapp
                          ? "Contrato enviado. O link de assinatura foi mandado pelo WhatsApp e está registrado na conversa."
                          : "Contrato enviado pra Autentique. Copie o link de assinatura pra entregar ao cliente."
                      );
                    });
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
              {c.status === "enviado" && (
                <>
                  {c.sign_link && (
                    <button
                      title="Copiar link de assinatura"
                      aria-label="Copiar link de assinatura"
                      onClick={() => {
                        navigator.clipboard.writeText(c.sign_link!);
                        setNotice("Link de assinatura copiado.");
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                    >
                      <Link2 className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    title="Atualizar status na Autentique"
                    aria-label="Atualizar status na Autentique"
                    disabled={busy === c.id}
                    onClick={() =>
                      run(c.id, async () => {
                        const r = await refreshContractStatus(c.id);
                        if (r?.error) return r;
                        setNotice(
                          r.signed
                            ? "Assinado!"
                            : r.rejected
                            ? "O cliente recusou o contrato."
                            : r.viewed
                            ? "O cliente já visualizou, mas ainda não assinou."
                            : "Ainda sem visualização. O sistema segue acompanhando sozinho."
                        );
                      })
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                  >
                    <RefreshCw
                      className={cn(
                        "h-4 w-4",
                        busy === c.id && "animate-spin"
                      )}
                    />
                  </button>
                </>
              )}
              {c.status === "assinado" && (
                <button
                  title="Marcar como encerrado"
                  aria-label="Marcar como encerrado"
                  disabled={busy === c.id}
                  onClick={() => {
                    if (confirm("Encerrar esse contrato?"))
                      run(c.id, () => closeContract(c.id));
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-success)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                >
                  <CheckCircle2 className="h-4 w-4" />
                </button>
              )}
              <button
                title="Ver PDF"
                aria-label="Ver PDF"
                disabled={busy === c.id}
                onClick={() =>
                  run(c.id, async () => {
                    const r = await getContractPdfUrl(c.id);
                    if ("error" in r) return { error: r.error };
                    window.open(r.url, "_blank");
                  })
                }
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              >
                <FileText className="h-4 w-4" />
              </button>
              <button
                title="Excluir contrato (daqui e da Autentique)"
                aria-label="Excluir contrato (daqui e da Autentique)"
                disabled={busy === c.id}
                onClick={() => {
                  const msg =
                    c.status === "assinado"
                      ? "Esse contrato está ASSINADO. Excluir apaga o registro daqui e o manda pra lixeira da Autentique. Tem certeza?"
                      : c.status === "enviado"
                      ? `Excluir "${c.title}"? Ele sai daqui e da Autentique — o link de assinatura para de funcionar.`
                      : `Excluir o rascunho "${c.title}"?`;
                  if (confirm(msg))
                    run(c.id, async () => {
                      const r = await deleteContract(c.id);
                      if (r?.error) return r;
                      setNotice(
                        r.autentiqueRemoved
                          ? "Contrato excluído daqui e removido da Autentique."
                          : r.autentiqueRemoved === false
                          ? "Contrato excluído daqui (não estava na Autentique ou a integração está sem token)."
                          : "Contrato excluído."
                      );
                    });
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
