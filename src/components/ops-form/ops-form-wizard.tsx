"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { submitOpsForm } from "@/app/f/[token]/actions";

// OPS Form — formulário público estilo Respondi/Typeform: uma pergunta por
// vez, Enter avança, mobile-first. O cliente preenche os próprios dados e o
// contrato nasce sozinho do outro lado.

export type OpsAnswers = {
  /** "Pessoa Física" | "Empresa (CNPJ)" */
  tipo: string;
  /** PF: nome da pessoa · PJ: razão social */
  nome: string;
  nacionalidade: string;
  estadoCivil: string;
  profissao: string;
  rg: string;
  /** PF: CPF do contratante · PJ: CPF de quem assina */
  cpf: string;
  cnpj: string;
  representante: string;
  endereco: string;
  cidadeUf: string;
  cep: string;
  email: string;
  empresa: string;
};

function cpfValido(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const dig = ((soma * 10) % 11) % 10;
    if (dig !== Number(d[n])) return false;
  }
  return true;
}

const maskCpf = (v: string) =>
  v
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");

const maskCep = (v: string) =>
  v.replace(/\D/g, "").slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");

function cnpjValido(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  for (const len of [12, 13]) {
    const pesos =
      len === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < len; i++) soma += Number(d[i]) * pesos[i];
    const resto = soma % 11;
    const dig = resto < 2 ? 0 : 11 - resto;
    if (dig !== Number(d[len])) return false;
  }
  return true;
}

const maskCnpj = (v: string) =>
  v
    .replace(/\D/g, "")
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");

type Step = {
  key: keyof OpsAnswers;
  label: string;
  hint?: string;
  placeholder?: string;
  type?: string;
  optional?: boolean;
  options?: string[];
  mask?: (v: string) => string;
  validate?: (v: string) => string | null;
};

export function OpsFormWizard({
  token,
  leadName,
}: {
  token: string;
  leadName: string;
}) {
  const first = leadName.split(" ")[0];

  const [screen, setScreen] = useState<"intro" | "steps" | "review" | "done">(
    "intro"
  );
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<OpsAnswers>({
    tipo: "",
    nome: leadName,
    nacionalidade: "",
    estadoCivil: "",
    profissao: "",
    rg: "",
    cpf: "",
    cnpj: "",
    representante: "",
    endereco: "",
    cidadeUf: "",
    cep: "",
    email: "",
    empresa: "",
  });

  const isPj = answers.tipo === "Empresa (CNPJ)";

  const steps: Step[] = useMemo(() => {
    const tipoStep: Step = {
      key: "tipo",
      label: "Você contrata como pessoa física ou como empresa?",
      options: ["Pessoa Física", "Empresa (CNPJ)"],
    };
    const cidadeStep: Step = {
      key: "cidadeUf",
      label: "Cidade e estado?",
      placeholder: "Acreúna – GO",
    };
    const cepStep: Step = {
      key: "cep",
      label: isPj ? "Qual o CEP da empresa?" : "Qual o seu CEP?",
      placeholder: "00000-000",
      mask: maskCep,
      validate: (v) =>
        v.replace(/\D/g, "").length === 8 ? null : "CEP incompleto.",
    };
    const emailStep: Step = {
      key: "email",
      label: "Qual o melhor e-mail?",
      hint: "O contrato também chega por lá.",
      placeholder: "voce@email.com",
      type: "email",
      validate: (v) => (/.+@.+\..+/.test(v) ? null : "E-mail inválido."),
    };

    if (isPj)
      return [
        tipoStep,
        {
          key: "nome",
          label: "Qual o nome da empresa (razão social)?",
          hint: "Como está no cartão CNPJ.",
          placeholder: "Razão social",
        },
        {
          key: "cnpj",
          label: "Qual o CNPJ?",
          placeholder: "00.000.000/0000-00",
          mask: maskCnpj,
          validate: (v) =>
            cnpjValido(v) ? null : "Confere o CNPJ? Esse número não é válido.",
        },
        {
          key: "endereco",
          label: "Qual o endereço da empresa (sede)?",
          hint: "Rua, número e bairro.",
          placeholder: "Rua das Flores, nº 123, Centro",
        },
        cidadeStep,
        cepStep,
        {
          key: "representante",
          label: "Quem assina pela empresa?",
          hint: "Nome completo de quem vai assinar o contrato.",
          placeholder: "Nome completo",
        },
        {
          key: "cpf",
          label: "Qual o CPF de quem assina?",
          placeholder: "000.000.000-00",
          mask: maskCpf,
          validate: (v) =>
            cpfValido(v) ? null : "Confere o CPF? Esse número não é válido.",
        },
        emailStep,
      ];

    return [
      tipoStep,
      {
        key: "nome",
        label: "Qual o seu nome completo?",
        hint: "Exatamente como aparece nos seus documentos.",
        placeholder: "Nome completo",
      },
      {
        key: "cpf",
        label: "Qual o seu CPF?",
        placeholder: "000.000.000-00",
        mask: maskCpf,
        validate: (v) =>
          cpfValido(v) ? null : "Confere o CPF? Esse número não é válido.",
      },
      {
        key: "endereco",
        label: "Qual o seu endereço?",
        hint: "Rua, número e bairro.",
        placeholder: "Rua das Flores, nº 123, Centro",
      },
      cidadeStep,
      cepStep,
      emailStep,
    ];
  }, [isPj]);

  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const step = steps[idx];
  const value = step ? answers[step.key] : "";

  useEffect(() => {
    if (screen === "steps") inputRef.current?.focus();
  }, [idx, screen]);

  function set(v: string) {
    setErr(null);
    setAnswers((a) => ({ ...a, [step.key]: step.mask ? step.mask(v) : v }));
  }

  function next() {
    const v = value.trim();
    if (!v && !step.optional) {
      setErr("Esse campo é importante pro contrato.");
      return;
    }
    if (v && step.validate) {
      const e = step.validate(v);
      if (e) {
        setErr(e);
        return;
      }
    }
    setErr(null);
    if (idx + 1 < steps.length) setIdx(idx + 1);
    else setScreen("review");
  }

  function back() {
    setErr(null);
    if (idx === 0) setScreen("intro");
    else setIdx(idx - 1);
  }

  async function enviar() {
    setSending(true);
    setErr(null);
    const r = await submitOpsForm(token, answers);
    setSending(false);
    if (r?.error) {
      setErr(r.error);
      return;
    }
    setScreen("done");
  }

  const progress =
    screen === "intro"
      ? 0
      : screen === "steps"
      ? Math.round((idx / steps.length) * 100)
      : 100;

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-background)]">
      {/* barra de progresso */}
      <div className="h-1.5 w-full bg-[var(--color-surface-2)]">
        <div
          className="h-full bg-[var(--color-primary)] transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 py-8">
        {/* marca */}
        <div className="mb-8 flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/symbol.svg" alt="Traciona" className="h-8 w-8" />
          <span className="text-sm font-semibold tracking-tight">Traciona</span>
        </div>

        {screen === "intro" && (
          <div className="flex flex-1 flex-col justify-center gap-4">
            <h1 className="text-2xl font-semibold leading-snug">
              Olá, {first}!
            </h1>
            <p className="text-[15px] leading-relaxed text-[var(--color-muted)]">
              Vamos preencher os seus dados pro seu contrato com a Traciona.
              São poucas perguntas rápidas — leva menos de 2 minutos.
            </p>
            <button
              onClick={() => setScreen("steps")}
              className="mt-2 flex h-12 w-fit items-center gap-2 rounded-xl bg-[var(--color-primary)] px-6 text-[15px] font-medium text-[var(--color-on-accent)] shadow-sm transition hover:opacity-90"
            >
              Começar
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {screen === "steps" && step && (
          <div className="flex flex-1 flex-col justify-center gap-4">
            <p className="text-xs font-medium text-[var(--color-muted-2)]">
              {idx + 1} de {steps.length}
            </p>
            <h1 className="text-xl font-semibold leading-snug sm:text-2xl">
              {step.label}
            </h1>
            {step.hint && (
              <p className="-mt-2 text-sm text-[var(--color-muted)]">
                {step.hint}
              </p>
            )}

            {step.options ? (
              <div className="flex flex-col gap-2">
                {step.options.map((o) => (
                  <button
                    key={o}
                    onClick={() => {
                      setAnswers((a) => ({ ...a, [step.key]: o }));
                      setErr(null);
                      setTimeout(() => {
                        if (idx + 1 < steps.length) setIdx(idx + 1);
                        else setScreen("review");
                      }, 150);
                    }}
                    className={cn(
                      "flex h-12 items-center justify-between rounded-xl border px-4 text-[15px] transition",
                      answers[step.key] === o
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/8 font-medium text-[var(--color-primary)]"
                        : "border-[var(--color-border)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface)]"
                    )}
                  >
                    {o}
                    {answers[step.key] === o && <Check className="h-4 w-4" />}
                  </button>
                ))}
              </div>
            ) : (
              <input
                ref={inputRef}
                value={value}
                type={step.type ?? "text"}
                inputMode={
                  step.key === "cpf" || step.key === "cep" || step.key === "rg"
                    ? "numeric"
                    : undefined
                }
                onChange={(e) => set(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && next()}
                placeholder={step.placeholder}
                className="h-13 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-base outline-none transition focus:border-[var(--color-primary)]"
              />
            )}

            {err && <p className="text-sm text-[var(--color-danger)]">{err}</p>}

            <div className="mt-1 flex items-center gap-2.5">
              <button
                onClick={back}
                className="flex h-11 items-center gap-1.5 rounded-xl border border-[var(--color-border)] px-4 text-sm text-[var(--color-muted)] transition hover:bg-[var(--color-surface)]"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </button>
              {!step.options && (
                <button
                  onClick={next}
                  className="flex h-11 items-center gap-2 rounded-xl bg-[var(--color-primary)] px-5 text-sm font-medium text-[var(--color-on-accent)] shadow-sm transition hover:opacity-90"
                >
                  {step.optional && !value.trim() ? "Pular" : "Continuar"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {screen === "review" && (
          <div className="flex flex-1 flex-col justify-center gap-4">
            <h1 className="text-xl font-semibold">Confere se está tudo certo:</h1>
            <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
              {steps.map((s, i) => {
                const v = answers[s.key].trim();
                return (
                  <button
                    key={s.key}
                    onClick={() => {
                      setIdx(i);
                      setScreen("steps");
                    }}
                    className="flex w-full items-baseline justify-between gap-3 border-b border-[var(--color-border)] px-4 py-2.5 text-left last:border-0 hover:bg-[var(--color-surface-2)]/60"
                  >
                    <span className="shrink-0 text-xs text-[var(--color-muted-2)]">
                      {s.label.replace("?", "")}
                    </span>
                    <span className="min-w-0 truncate text-sm font-medium">
                      {v || "—"}
                    </span>
                  </button>
                );
              })}
            </div>
            {err && <p className="text-sm text-[var(--color-danger)]">{err}</p>}
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => {
                  setIdx(steps.length - 1);
                  setScreen("steps");
                }}
                className="flex h-11 items-center gap-1.5 rounded-xl border border-[var(--color-border)] px-4 text-sm text-[var(--color-muted)] transition hover:bg-[var(--color-surface)]"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </button>
              <button
                onClick={enviar}
                disabled={sending}
                className="flex h-11 items-center gap-2 rounded-xl bg-[var(--color-primary)] px-5 text-sm font-medium text-[var(--color-on-accent)] shadow-sm transition hover:opacity-90 disabled:opacity-60"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    Confirmar e enviar
                    <Check className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {screen === "done" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
              <Check className="h-8 w-8 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-semibold">Tudo certo, {first}!</h1>
            <p className="max-w-sm text-[15px] leading-relaxed text-[var(--color-muted)]">
              Recebemos os seus dados e o seu contrato já está sendo preparado.
              Em breve você recebe o link de assinatura aqui no seu WhatsApp.
            </p>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-[var(--color-muted-2)]">
          Seus dados são usados somente pra emissão do seu contrato · Traciona
        </p>
      </div>
    </div>
  );
}
