"use client";

import { Send, FileText, Upload } from "lucide-react";
import { cn } from "@/lib/utils/ui";
import {
  MODES,
  Tip,
  inputCls,
  labelCls,
  sectionCls,
} from "./status-meta";
import { ModeloContractorFields } from "./modelo-contractor-fields";
import type { LeadOption, Mode } from "./types";

type CreateContractFormProps = {
  formRef: React.RefObject<HTMLFormElement | null>;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  tipoContrato: "pf" | "pj";
  setTipoContrato: (t: "pf" | "pj") => void;
  leads: LeadOption[];
  busy: string | null;
  setShowForm: (v: boolean) => void;
};

export function CreateContractForm({
  formRef,
  onSubmit,
  mode,
  setMode,
  tipoContrato,
  setTipoContrato,
  leads,
  busy,
  setShowForm,
}: CreateContractFormProps) {
  return (
    <div className="card mb-6 rounded-2xl p-4 sm:p-5">
      <p className={cn(sectionCls, "mb-2.5")}>1 · Como criar</p>
      <div className="mb-5 grid gap-2.5 sm:grid-cols-3">
        {MODES.map((m) => {
          const active = mode === m.key;
          const Icon = m.icon;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={cn(
                "flex flex-col gap-1.5 rounded-xl border p-3.5 text-left transition",
                active
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5"
                  : "border-[var(--color-border)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)]/50"
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg",
                    active
                      ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                      : "bg-[var(--color-surface-2)] text-[var(--color-muted)]"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span
                  className={cn(
                    "text-sm font-semibold",
                    active && "text-[var(--color-primary)]"
                  )}
                >
                  {m.title}
                </span>
              </span>
              <span className="text-xs leading-relaxed text-[var(--color-muted)]">
                {m.desc}
              </span>
            </button>
          );
        })}
      </div>

      <form ref={formRef} onSubmit={onSubmit}>
        <p className={cn(sectionCls, "mb-2.5")}>
          {mode === "upload" ? "2 · Cliente e arquivo" : "2 · Cliente e termos"}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>
            Cliente * (qualquer contato — com ou sem negócio no funil)
            <select name="lead_id" required className={inputCls}>
              <option value="">Escolha o cliente...</option>
              {leads.some((l) => l.pipeline_id) && (
                <optgroup label="No funil">
                  {leads
                    .filter((l) => l.pipeline_id)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                </optgroup>
              )}
              <optgroup label="Contatos">
                {leads
                  .filter((l) => !l.pipeline_id)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
              </optgroup>
            </select>
          </label>

          {mode === "opsform" && (
            <>
              <label className={labelCls}>
                Valor mensal (R$) *
                <input
                  name="valor_mensal"
                  required
                  inputMode="decimal"
                  placeholder="2500,00"
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                <span>
                  Prazo (meses) *
                  <Tip text="Duração do contrato em meses — a data de término é calculada sozinha." />
                </span>
                <input
                  name="prazo_meses"
                  required
                  type="number"
                  min={1}
                  max={60}
                  placeholder="6"
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                Data de início *
                <input
                  name="data_inicio"
                  required
                  type="date"
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                <span>
                  Dia de vencimento *
                  <Tip text="Dia do mês em que a mensalidade vence (ex.: todo dia 10)." />
                </span>
                <input
                  name="dia_vencimento"
                  required
                  type="number"
                  min={1}
                  max={31}
                  placeholder="10"
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                <span>
                  Comarca (foro)
                  <Tip text="Cidade cujo fórum resolve eventuais disputas do contrato." />
                </span>
                <input
                  name="comarca"
                  defaultValue="Acreúna – Goiás"
                  className={inputCls}
                />
              </label>
              <p className="text-xs leading-relaxed text-[var(--color-muted)] sm:col-span-2">
                O cliente recebe o link no WhatsApp, escolhe se contrata como
                pessoa física ou empresa e preenche os próprios dados. Quando ele
                terminar, o contrato aparece aqui como rascunho, pronto pra
                revisar e enviar.
              </p>
            </>
          )}

          {mode === "modelo" && (
            <>
              <label className={labelCls}>
                Tipo de contratante
                <select
                  name="tipo"
                  value={tipoContrato}
                  onChange={(e) =>
                    setTipoContrato(e.target.value as "pf" | "pj")
                  }
                  className={inputCls}
                >
                  <option value="pf">Pessoa Física</option>
                  <option value="pj">Empresa (CNPJ)</option>
                </select>
              </label>
              <label className={labelCls}>
                Valor mensal (R$) *
                <input
                  name="valor_mensal"
                  required
                  inputMode="decimal"
                  placeholder="2500,00"
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                <span>
                  Prazo (meses) *
                  <Tip text="Duração do contrato em meses — a data de término é calculada sozinha." />
                </span>
                <input
                  name="prazo_meses"
                  required
                  type="number"
                  min={1}
                  max={60}
                  placeholder="6"
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                Data de início *
                <input
                  name="data_inicio"
                  required
                  type="date"
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                <span>
                  Dia de vencimento *
                  <Tip text="Dia do mês em que a mensalidade vence (ex.: todo dia 10)." />
                </span>
                <input
                  name="dia_vencimento"
                  required
                  type="number"
                  min={1}
                  max={31}
                  placeholder="10"
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                <span>
                  Comarca (foro)
                  <Tip text="Cidade cujo fórum resolve eventuais disputas do contrato." />
                </span>
                <input
                  name="comarca"
                  defaultValue="Acreúna – Goiás"
                  className={inputCls}
                />
              </label>
            </>
          )}

          {mode === "upload" && (
            <>
              <label className={labelCls}>
                Título do contrato *
                <input
                  name="title"
                  required
                  placeholder="Ex.: Contrato de Gestão de Marketing"
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                Valor (R$)
                <input
                  name="value"
                  inputMode="decimal"
                  placeholder="Ex.: 2500,00"
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                E-mail do signatário (opcional)
                <input
                  name="signer_email"
                  type="email"
                  placeholder="cliente@empresa.com"
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                Início da vigência
                <input name="starts_at" type="date" className={inputCls} />
              </label>
              <label className={labelCls}>
                Fim da vigência
                <input name="ends_at" type="date" className={inputCls} />
              </label>
              <label className={cn(labelCls, "sm:col-span-2")}>
                PDF do contrato * (máx. 4,5 MB)
                <input
                  name="file"
                  type="file"
                  accept="application/pdf"
                  required
                  className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--color-surface-2)] file:px-3 file:py-1.5 file:text-xs file:font-medium"
                />
              </label>
            </>
          )}
        </div>

        {mode === "modelo" && (
          <ModeloContractorFields tipoContrato={tipoContrato} />
        )}

        <div className="mt-5 flex items-center justify-end gap-2.5 border-t border-[var(--color-border)] pt-4">
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="h-10 px-3 text-sm text-[var(--color-muted)] transition hover:text-[var(--color-foreground)]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy === "new"}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-5 text-sm font-medium text-[var(--color-primary-foreground)] shadow-sm transition hover:opacity-90 disabled:opacity-50"
          >
            {busy === "new" ? (
              mode === "opsform" ? (
                "Criando e enviando..."
              ) : mode === "modelo" ? (
                "Gerando PDF..."
              ) : (
                "Salvando..."
              )
            ) : mode === "opsform" ? (
              <>
                <Send className="h-4 w-4" />
                Criar e enviar pro cliente
              </>
            ) : mode === "modelo" ? (
              <>
                <FileText className="h-4 w-4" />
                Gerar contrato
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Salvar contrato
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
