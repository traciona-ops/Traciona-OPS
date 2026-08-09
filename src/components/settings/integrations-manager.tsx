"use client";

import { useEffect, useState } from "react";
import {
  Plug,
  Loader2,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils/ui";
import { toast } from "@/components/ui/toast";
import { GoogleCalendarConnect } from "@/components/agenda/google-calendar-connect";
import {
  getIntegrationsStatus,
  saveIntegration,
  type IntegrationStatus,
} from "@/app/(dashboard)/settings/integrations-actions";

// Central de Integrações: status ao vivo + troca de chave sem deploy.
// A chave é testada na API real antes de salvar e vai pro cofre do banco.

type Statuses = {
  dinastiapi: IntegrationStatus;
  autentique: IntegrationStatus;
  asaas: IntegrationStatus;
};

export function IntegrationsManager() {
  const [st, setSt] = useState<Statuses | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setSt(await getIntegrationsStatus());
    } catch {
      toast("Não consegui checar as integrações.", { type: "error" });
    }
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(kind: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(kind);
    const r = await saveIntegration(kind, form);
    setBusy(null);
    if (r?.error) {
      toast(r.error, { type: "error" });
      return;
    }
    e.currentTarget?.reset?.();
    toast("Chave validada e salva.");
    load();
  }

  return (
    <section className="card p-5">
      <div className="mb-1 flex items-center gap-2">
        <Plug className="h-4 w-4 text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Integrações</h2>
        <button
          onClick={load}
          disabled={loading}
          title="Checar conexões de novo"
          aria-label="Checar conexões de novo"
          className="ml-auto flex min-h-9 min-w-9 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>
      <p className="mb-4 text-xs text-[var(--color-muted-2)]">
        Chaves testadas na API real antes de salvar. Ficam no cofre do
        servidor — o navegador nunca as lê de volta.
      </p>

      <div className="space-y-3">
        <IntegrationCard
          logo="/integrations/dinastiapi.png"
          title="DinastiAPI"
          desc="WhatsApp do OPS Chat — sessões, envio e webhooks"
          status={st?.dinastiapi}
          loading={loading}
          busy={busy === "dinastiapi"}
          onSubmit={(e) => save("dinastiapi", e)}
          fields={
            <input
              name="admin_token"
              type="password"
              placeholder="Novo token ADMIN da DinastiAPI"
              className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm outline-none transition focus:border-[var(--color-primary)]"
            />
          }
          extra={
            <Link
              href="/chat"
              className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
            >
              Conectar números (QR) no OPS Chat → Configurações → Número
              <ExternalLink className="h-3 w-3" />
            </Link>
          }
        />

        <IntegrationCard
          logo="/integrations/autentique.png"
          title="Autentique"
          desc="Assinatura digital dos contratos"
          status={st?.autentique}
          loading={loading}
          busy={busy === "autentique"}
          onSubmit={(e) => save("autentique", e)}
          fields={
            <input
              name="token"
              type="password"
              placeholder="Novo token da API (painel Autentique → Configurações → API)"
              className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm outline-none transition focus:border-[var(--color-primary)]"
            />
          }
        />

        <IntegrationCard
          logo="/integrations/asaas.png"
          title="Asaas"
          desc="Cobranças, assinaturas e pagamentos das Vendas"
          status={st?.asaas}
          loading={loading}
          busy={busy === "asaas"}
          onSubmit={(e) => save("asaas", e)}
          fields={
            <>
              <input
                name="api_key"
                type="password"
                placeholder="Nova chave da API ($aact_...)"
                className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm outline-none transition focus:border-[var(--color-primary)]"
              />
              <select
                name="environment"
                defaultValue="prod"
                className="h-10 shrink-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm outline-none transition focus:border-[var(--color-primary)]"
              >
                <option value="prod">Produção</option>
                <option value="sandbox">Sandbox</option>
              </select>
            </>
          }
        />

        <GoogleCalendarConnect />
      </div>
    </section>
  );
}

function IntegrationCard({
  logo,
  title,
  desc,
  status,
  loading,
  busy,
  onSubmit,
  fields,
  extra,
}: {
  logo: string;
  title: string;
  desc: string;
  status?: IntegrationStatus;
  loading: boolean;
  busy: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  fields: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logo}
            alt={title}
            className="h-7 w-7 object-contain"
            loading="lazy"
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="truncate text-xs text-[var(--color-muted)]">{desc}</p>
        </div>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-[var(--color-muted-2)]" />
        ) : status ? (
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
              status.ok
                ? "bg-[color-mix(in_srgb,var(--color-success)_12%,var(--color-surface))] text-[var(--color-success)]"
                : status.configured
                ? "bg-[var(--color-danger)]/10 text-[var(--color-danger)]"
                : "bg-[var(--color-surface-2)] text-[var(--color-muted-2)]"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                status.ok
                  ? "bg-[var(--color-success)]"
                  : status.configured
                  ? "bg-[var(--color-danger)]"
                  : "bg-[var(--color-muted-2)]"
              )}
            />
            {status.ok
              ? "Conectado"
              : status.configured
              ? "Com problema"
              : "Não configurado"}
          </span>
        ) : null}
      </div>

      {!loading && status && (
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          {status.detail}
          {status.source && (
            <span className="text-[var(--color-muted-2)]">
              {" "}
              · chave via {status.source === "painel" ? "painel" : "servidor (.env)"}
            </span>
          )}
        </p>
      )}
      {extra && <div className="mt-2">{extra}</div>}

      <form onSubmit={onSubmit} className="mt-3 flex flex-wrap items-center gap-2">
        {fields}
        <button
          type="submit"
          disabled={busy}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Testando...
            </>
          ) : (
            "Testar e salvar"
          )}
        </button>
      </form>
    </div>
  );
}
