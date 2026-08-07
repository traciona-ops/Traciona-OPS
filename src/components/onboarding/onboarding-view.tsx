"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardCheck,
  Copy,
  Eye,
  Link2,
  Loader2,
  Plus,
  Send,
  Trash2,
  X,
  FileDown,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import {
  visibleQuestions,
  obAnswerLabel,
  OB_QUESTIONS,
  type ObAnswers,
} from "@/lib/onboarding-questions";
import {
  createOnboarding,
  sendOnboardingLink,
  cancelOnboarding,
  deleteOnboarding,
} from "@/app/(dashboard)/onboarding/actions";

// Painel interno do Onboarding: cria o link, envia pelo WhatsApp,
// acompanha o progresso e lê as respostas na gaveta lateral.

export type LeadOpt = { id: string; name: string; phone: string | null };
export type ObRow = {
  id: string;
  token: string;
  client_name: string;
  status: "pendente" | "em_andamento" | "respondido" | "cancelado";
  answers: ObAnswers | null;
  assets: { name: string; url: string }[] | null;
  created_at: string;
  answered_at: string | null;
  lead: { id: string; name: string; phone: string | null; avatar_url: string | null } | null;
};

const STATUS_META: Record<
  ObRow["status"],
  { label: string; cls: string; dot: string }
> = {
  pendente: {
    label: "Aguardando",
    cls: "bg-[var(--color-surface-2)] text-[var(--color-muted)]",
    dot: "bg-[var(--color-muted-2)]",
  },
  em_andamento: {
    label: "Respondendo",
    cls: "bg-[color-mix(in_srgb,var(--color-warning)_12%,var(--color-surface))] text-[var(--color-warning)]",
    dot: "bg-[var(--color-warning)]",
  },
  respondido: {
    label: "Concluído",
    cls: "bg-[color-mix(in_srgb,var(--color-success)_12%,var(--color-surface))] text-[var(--color-success)]",
    dot: "bg-[var(--color-success)]",
  },
  cancelado: {
    label: "Cancelado",
    cls: "bg-[var(--color-danger)]/10 text-[var(--color-danger)]",
    dot: "bg-[var(--color-danger)]",
  },
};

export function OnboardingView({
  rows,
  leads,
}: {
  rows: ObRow[];
  leads: LeadOpt[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<"todos" | ObRow["status"]>("todos");
  const [viewing, setViewing] = useState<ObRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = useMemo(
    () => rows.filter((r) => filter === "todos" || r.status === filter),
    [rows, filter]
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  async function copyLink(row: ObRow) {
    const link = `${location.origin}/o/${row.token}`;
    await navigator.clipboard.writeText(link);
    toast("Link copiado.");
  }

  async function send(row: ObRow) {
    setBusy(row.id);
    const r = await sendOnboardingLink(row.id);
    setBusy(null);
    if (r?.error) toast(r.error, { type: "error" });
    else toast("Link enviado no WhatsApp.");
  }

  async function cancel(row: ObRow) {
    if (!confirm(`Cancelar o onboarding de ${nome(row)}? O link para de funcionar.`)) return;
    setBusy(row.id);
    const r = await cancelOnboarding(row.id);
    setBusy(null);
    if (r?.error) toast(r.error, { type: "error" });
    else router.refresh();
  }

  async function remove(row: ObRow) {
    if (!confirm(`Excluir o onboarding de ${nome(row)}? Não dá pra desfazer.`)) return;
    setBusy(row.id);
    const r = await deleteOnboarding(row.id);
    setBusy(null);
    if (r?.error) toast(r.error, { type: "error" });
    else router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Filtros + criar */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["todos", `Todos (${rows.length})`],
            ["pendente", `Aguardando (${counts.pendente ?? 0})`],
            ["em_andamento", `Respondendo (${counts.em_andamento ?? 0})`],
            ["respondido", `Concluídos (${counts.respondido ?? 0})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              "h-9 rounded-full px-3.5 text-sm font-medium transition-colors",
              filter === key
                ? "bg-[var(--color-foreground)] text-[var(--color-background)]"
                : "bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
            )}
          >
            {label}
          </button>
        ))}
        <Button className="ml-auto" onClick={() => setCreating((c) => !c)}>
          <Plus className="h-4 w-4" />
          Novo onboarding
        </Button>
      </div>

      {creating && (
        <CreateForm
          leads={leads}
          onDone={() => {
            setCreating(false);
            router.refresh();
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {/* Lista */}
      <div className="space-y-2">
        {filtered.map((row) => {
          const meta = STATUS_META[row.status];
          const progresso = progressoDe(row);
          return (
            <div
              key={row.id}
              className="card flex flex-wrap items-center gap-3 p-4"
            >
              <Avatar
                name={nome(row)}
                src={row.lead?.avatar_url}
                size={36}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{nome(row)}</p>
                <p className="text-xs text-[var(--color-muted)]">
                  {new Date(row.created_at).toLocaleDateString("pt-BR")}
                  {row.status === "em_andamento" &&
                    ` · ${progresso.feitas}/${progresso.total} respondidas`}
                  {row.status === "respondido" &&
                    row.answered_at &&
                    ` · concluído em ${new Date(row.answered_at).toLocaleDateString("pt-BR")}`}
                </p>
              </div>
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
                  meta.cls
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                {meta.label}
              </span>
              <div className="flex items-center gap-1">
                {(row.status === "respondido" || row.status === "em_andamento") && (
                  <IconBtn title="Ver respostas" onClick={() => setViewing(row)}>
                    <Eye className="h-4 w-4" />
                  </IconBtn>
                )}
                {row.status !== "cancelado" && row.status !== "respondido" && (
                  <>
                    <IconBtn title="Copiar link" onClick={() => copyLink(row)}>
                      <Link2 className="h-4 w-4" />
                    </IconBtn>
                    {row.lead?.phone && (
                      <IconBtn
                        title="Enviar no WhatsApp"
                        onClick={() => send(row)}
                        disabled={busy === row.id}
                      >
                        {busy === row.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </IconBtn>
                    )}
                    <IconBtn
                      title="Cancelar link"
                      onClick={() => cancel(row)}
                      danger
                    >
                      <X className="h-4 w-4" />
                    </IconBtn>
                  </>
                )}
                {(row.status === "cancelado" || row.status === "respondido") && (
                  <IconBtn title="Excluir" onClick={() => remove(row)} danger>
                    <Trash2 className="h-4 w-4" />
                  </IconBtn>
                )}
              </div>
            </div>
          );
        })}
        {!filtered.length && (
          <div className="card flex flex-col items-center p-10 text-center">
            <ClipboardCheck className="mb-3 h-8 w-8 text-[var(--color-muted-2)]" />
            <p className="text-sm text-[var(--color-muted)]">
              Nenhum onboarding por aqui ainda. Crie um e mande o link pro
              cliente — as respostas chegam sozinhas.
            </p>
          </div>
        )}
      </div>

      {/* Gaveta de respostas */}
      <Drawer
        open={viewing !== null}
        onClose={() => setViewing(null)}
        size="md"
        title={
          viewing && (
            <div className="flex items-center gap-3">
              <Avatar name={nome(viewing)} src={viewing.lead?.avatar_url} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{nome(viewing)}</p>
                <p className="text-xs text-[var(--color-muted)]">
                  Respostas do onboarding
                </p>
              </div>
            </div>
          )
        }
      >
        {viewing && (
          <div className="space-y-3">
            {OB_QUESTIONS.filter((q) => q.type !== "upload").map((q) => {
              const v = viewing.answers?.[q.key];
              if (v === undefined) return null;
              return (
                <div key={q.key}>
                  <p className="text-xs font-medium text-[var(--color-muted-2)]">
                    {q.title}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm">
                    {v.trim() ? obAnswerLabel(q.key, v) : "—"}
                  </p>
                </div>
              );
            })}
            {(viewing.assets?.length ?? 0) > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-[var(--color-muted-2)]">
                  Materiais enviados
                </p>
                <div className="space-y-1.5">
                  {viewing.assets!.map((a, i) => (
                    <a
                      key={i}
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-lg bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-primary)] hover:underline"
                    >
                      <FileDown className="h-4 w-4 shrink-0" />
                      <span className="truncate">{a.name}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
            {!Object.keys(viewing.answers ?? {}).length && (
              <p className="text-sm text-[var(--color-muted)]">
                Ainda sem respostas.
              </p>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

function nome(r: ObRow) {
  return r.lead?.name || r.client_name || "Cliente";
}

function progressoDe(r: ObRow) {
  const answers = r.answers ?? {};
  const vis = visibleQuestions(answers).filter((q) => q.type !== "upload");
  const feitas = vis.filter((q) => (answers[q.key] ?? "") !== "" || q.optional && answers[q.key] !== undefined).length;
  return { feitas: Math.min(feitas, vis.length), total: vis.length };
}

function IconBtn({
  children,
  title,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-lg transition",
        danger
          ? "text-[var(--color-muted)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
          : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
      )}
    >
      {children}
    </button>
  );
}

function CreateForm({
  leads,
  onDone,
  onCancel,
}: {
  leads: LeadOpt[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [leadId, setLeadId] = useState("");
  const [clientName, setClientName] = useState("");
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const leadSel = leads.find((l) => l.id === leadId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const r = await createOnboarding({ leadId: leadId || null, clientName });
    setLoading(false);
    if (r?.error) {
      toast(r.error, { type: "error" });
      return;
    }
    setLink(r.link ?? null);
    setCreatedId(r.id ?? null);
    toast("Onboarding criado.");
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    toast("Link copiado.");
  }

  async function sendNow() {
    if (!createdId) return;
    setSending(true);
    const r = await sendOnboardingLink(createdId);
    setSending(false);
    if (r?.error) toast(r.error, { type: "error" });
    else {
      toast("Link enviado no WhatsApp.");
      onDone();
    }
  }

  if (link) {
    return (
      <div className="card p-4">
        <p className="text-sm font-medium">Link do onboarding pronto:</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-[var(--color-surface-2)] px-3 py-2 text-xs">
            {link}
          </code>
          <Button size="sm" variant="ghost" onClick={copy}>
            <Copy className="h-3.5 w-3.5" />
            Copiar
          </Button>
          {leadSel?.phone && (
            <Button size="sm" onClick={sendNow} disabled={sending}>
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Enviar no WhatsApp
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDone}>
            Fechar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">Novo onboarding</h3>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Fechar"
          className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[var(--color-surface-2)]"
        >
          <X className="h-4 w-4 text-[var(--color-muted)]" />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <select
          value={leadId}
          onChange={(e) => setLeadId(e.target.value)}
          className="h-10 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 text-sm"
        >
          <option value="">Vincular a um contato (opcional)</option>
          {leads.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
              {l.phone ? "" : " (sem WhatsApp)"}
            </option>
          ))}
        </select>
        <Input
          placeholder="Ou nome do cliente (sem contato)"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
        />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={loading}>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Gerar link
        </Button>
      </div>
    </form>
  );
}
