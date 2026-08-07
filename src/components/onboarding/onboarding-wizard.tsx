"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CloudUpload,
  FileCheck2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  visibleQuestions,
  type ObAnswers,
  type ObQuestion,
} from "@/lib/onboarding-questions";
import {
  saveOnboardingProgress,
  uploadOnboardingAsset,
  finishOnboarding,
} from "@/app/o/[token]/actions";

// Wizard público do Onboarding: UMA pergunta em foco por vez, botões
// grandes, barra de progresso e autosave — fecha e volta de onde parou.
// A árvore é dinâmica: respostas mudam as próximas perguntas.

export function OnboardingWizard({
  token,
  clientName,
  initialAnswers,
  initialStep,
  initialAssets,
}: {
  token: string;
  clientName: string;
  initialAnswers: ObAnswers;
  initialStep: number;
  initialAssets: { name: string; url: string }[];
}) {
  const [answers, setAnswers] = useState<ObAnswers>(initialAnswers);
  const [started, setStarted] = useState(initialStep > 0 || Object.keys(initialAnswers).length > 0);
  const [idx, setIdx] = useState(0);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [assets, setAssets] = useState(initialAssets);
  const [uploading, setUploading] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const fieldId = useId();

  const questions = useMemo(() => visibleQuestions(answers), [answers]);
  const total = questions.length;
  // retoma de onde parou (clampado — a árvore pode ter mudado)
  useEffect(() => {
    setIdx((i) => Math.min(Math.max(i, Math.min(initialStep, total - 1)), total - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q: ObQuestion | undefined = questions[idx];
  const isReview = idx >= total;
  const value = q ? answers[q.key] ?? "" : "";

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [idx, started]);

  function persist(nextAnswers: ObAnswers, nextIdx: number) {
    setSaving("saving");
    saveOnboardingProgress(token, nextAnswers, nextIdx)
      .then(() => setSaving("saved"))
      .catch(() => setSaving("idle"));
  }

  function advance(withValue?: string) {
    if (!q) return;
    const v = withValue ?? value;
    if (!q.optional && q.type !== "upload" && !v.trim()) return;
    const next = { ...answers, [q.key]: v };
    setAnswers(next);
    const nx = idx + 1;
    setIdx(nx);
    persist(next, nx);
  }

  function back() {
    if (idx > 0) setIdx(idx - 1);
  }

  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      const r = await uploadOnboardingAsset(token, fd);
      if (r && "url" in r && r.url)
        setAssets((prev) => [...prev, { name: r.name!, url: r.url! }]);
    }
    setUploading(false);
  }

  async function finish() {
    setFinishing(true);
    const r = await finishOnboarding(token, answers);
    setFinishing(false);
    if (!r?.error) setDone(true);
  }

  if (done) {
    return (
      <Shell progress={100}>
        <div className="flex flex-col items-center text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-success)_12%,var(--color-surface))]">
            <Check className="h-7 w-7 text-[var(--color-success)]" />
          </span>
          <h1 className="text-2xl font-semibold">Onboarding concluído!</h1>
          <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-[var(--color-muted)]">
            Recebemos tudo. Nossa equipe já está preparando o seu
            planejamento — qualquer coisa a gente se fala pelo WhatsApp.
          </p>
        </div>
      </Shell>
    );
  }

  if (!started) {
    return (
      <Shell progress={0}>
        <div className="flex flex-col items-center text-center">
          <h1 className="text-2xl font-semibold leading-snug sm:text-3xl">
            Boas-vindas, {clientName.split(" ")[0]}!
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-[var(--color-muted)]">
            Pra começar com o pé direito, precisamos conhecer o seu negócio.
            São {total} perguntas rápidas — leva uns 5 minutos, e o seu
            progresso fica salvo se precisar parar no meio.
          </p>
          <button
            onClick={() => setStarted(true)}
            className="mt-8 flex h-12 items-center gap-2 rounded-xl bg-[var(--color-primary)] px-8 text-base font-medium text-[var(--color-primary-foreground)] shadow-sm transition hover:opacity-90"
          >
            Começar
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </Shell>
    );
  }

  if (isReview) {
    return (
      <Shell progress={100}>
        <div className="w-full">
          <h1 className="text-2xl font-semibold">Só confirmar 👇</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Revisa se está tudo certo antes de enviar.
          </p>
          <div className="mt-5 max-h-[46dvh] space-y-2 overflow-y-auto pr-1">
            {questions.map((qq) => {
              const v = answers[qq.key];
              const label =
                qq.type === "upload"
                  ? assets.length
                    ? `${assets.length} arquivo(s) enviado(s)`
                    : "Nenhum arquivo"
                  : qq.options?.find((o) => o.value === v)?.label ?? v;
              return (
                <div
                  key={qq.key}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5"
                >
                  <p className="text-xs text-[var(--color-muted-2)]">{qq.title}</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm">
                    {label?.trim() ? label : "—"}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={back}
              className="flex h-11 items-center gap-1.5 rounded-xl px-4 text-sm text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
            <button
              onClick={finish}
              disabled={finishing}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-8 text-base font-medium text-[var(--color-primary-foreground)] shadow-sm transition hover:opacity-90 disabled:opacity-60"
            >
              {finishing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Check className="h-5 w-5" />
              )}
              Enviar onboarding
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell progress={Math.round((idx / total) * 100)} savingState={saving}>
      <div className="w-full">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-primary)]">
          {idx + 1} de {total}
        </p>
        {q!.type === "text" || q!.type === "textarea" ? (
          <label
            htmlFor={fieldId}
            className="mt-2 block text-2xl font-semibold leading-snug sm:text-[28px]"
          >
            {q!.title}
          </label>
        ) : (
          <h1 className="mt-2 text-2xl font-semibold leading-snug sm:text-[28px]">
            {q!.title}
          </h1>
        )}
        {q!.hint && (
          <p className="mt-2 text-sm text-[var(--color-muted)]">{q!.hint}</p>
        )}

        <div className="mt-6">
          {q!.type === "choice" && (
            <div className="grid gap-2.5">
              {q!.options!.map((o) => {
                const selected = value === o.value;
                return (
                  <button
                    key={o.value}
                    onClick={() => advance(o.value)}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border px-5 py-4 text-left transition",
                      selected
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/8"
                        : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-surface-2)]"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition",
                        selected
                          ? "border-[var(--color-primary)] bg-[var(--color-primary)]"
                          : "border-[var(--color-border-strong)]"
                      )}
                    >
                      {selected && (
                        <Check className="h-3 w-3 text-[var(--color-primary-foreground)]" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-medium">
                        {o.label}
                      </span>
                      {o.desc && (
                        <span className="block text-xs text-[var(--color-muted)]">
                          {o.desc}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {q!.type === "text" && (
            <input
              id={fieldId}
              ref={(el) => {
                inputRef.current = el;
              }}
              value={value}
              onChange={(e) =>
                setAnswers({ ...answers, [q!.key]: e.target.value })
              }
              onKeyDown={(e) => e.key === "Enter" && advance()}
              placeholder={q!.placeholder}
              className="h-14 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 text-base outline-none transition focus:border-[var(--color-primary)]"
            />
          )}

          {q!.type === "textarea" && (
            <textarea
              id={fieldId}
              ref={(el) => {
                inputRef.current = el;
              }}
              value={value}
              onChange={(e) =>
                setAnswers({ ...answers, [q!.key]: e.target.value })
              }
              onKeyDown={(e) =>
                e.key === "Enter" && (e.ctrlKey || e.metaKey) && advance()
              }
              placeholder={q!.placeholder}
              rows={5}
              className="w-full resize-none rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4 text-base leading-relaxed outline-none transition focus:border-[var(--color-primary)]"
            />
          )}

          {q!.type === "upload" && (
            <div>
              <label
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] px-6 py-10 text-center transition hover:border-[var(--color-primary)]/60 hover:bg-[var(--color-surface-2)]",
                  uploading && "pointer-events-none opacity-60"
                )}
              >
                {uploading ? (
                  <Loader2 className="h-7 w-7 animate-spin text-[var(--color-primary)]" />
                ) : (
                  <CloudUpload className="h-7 w-7 text-[var(--color-primary)]" />
                )}
                <span className="text-sm font-medium">
                  {uploading ? "Enviando..." : "Toque pra escolher os arquivos"}
                </span>
                <span className="text-xs text-[var(--color-muted-2)]">
                  Logo, manual da marca, fotos — até 25MB cada
                </span>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  accept="image/*,.pdf,.zip,.ai,.psd,.svg"
                  onChange={(e) => onUpload(e.target.files)}
                />
              </label>
              {assets.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {assets.map((a, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--color-success)_10%,var(--color-surface))] px-3 py-1.5 text-xs font-medium text-[var(--color-success)]"
                    >
                      <FileCheck2 className="h-3.5 w-3.5" />
                      {a.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-7 flex items-center gap-3">
          {idx > 0 && (
            <button
              onClick={back}
              className="flex h-11 items-center gap-1.5 rounded-xl px-4 text-sm text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
          )}
          {q!.type !== "choice" && (
            <button
              onClick={() => advance()}
              disabled={!q!.optional && q!.type !== "upload" && !value.trim()}
              className="flex h-12 items-center gap-2 rounded-xl bg-[var(--color-primary)] px-8 text-base font-medium text-[var(--color-primary-foreground)] shadow-sm transition hover:opacity-90 disabled:opacity-40"
            >
              Continuar
              <ArrowRight className="h-5 w-5" />
            </button>
          )}
          {q!.optional && q!.type !== "choice" && !value.trim() && (
            <button
              onClick={() => advance("")}
              className="text-sm text-[var(--color-muted-2)] underline-offset-2 hover:underline"
            >
              Pular
            </button>
          )}
        </div>
        {q!.type === "text" && (
          <p className="mt-3 text-xs text-[var(--color-muted-2)]">
            Enter ↵ pra continuar
          </p>
        )}
      </div>
    </Shell>
  );
}

function Shell({
  children,
  progress,
  savingState,
}: {
  children: React.ReactNode;
  progress: number;
  savingState?: "idle" | "saving" | "saved";
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-background)]">
      {/* Barra de progresso fixa no topo */}
      <div className="fixed inset-x-0 top-0 z-10 h-1.5 bg-[var(--color-surface-2)]">
        <div
          className="h-full bg-[var(--color-primary)] transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <header className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/symbol.svg" alt="Traciona" className="h-8 w-8" />
          <span className="text-sm font-semibold tracking-tight">Traciona</span>
        </div>
        {savingState === "saved" && (
          <span className="flex items-center gap-1 text-xs text-[var(--color-muted-2)]">
            <Check className="h-3.5 w-3.5" />
            Progresso salvo
          </span>
        )}
        {savingState === "saving" && (
          <span className="flex items-center gap-1 text-xs text-[var(--color-muted-2)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Salvando...
          </span>
        )}
      </header>
      <main className="flex flex-1 items-center justify-center px-5 pb-16">
        <div className="w-full max-w-xl">{children}</div>
      </main>
    </div>
  );
}
