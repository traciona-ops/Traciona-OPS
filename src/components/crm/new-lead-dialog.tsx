"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import {
  createLead,
  attachDeal,
  addNote,
} from "@/app/(dashboard)/crm/actions";
import { SOURCE_LABEL, type LeadSource, type Profile } from "@/lib/types";

// "Adicionar negócio" em duas colunas (layout Groner, cores do sistema):
//   esquerda = o NEGÓCIO (valor, origem, responsável, descrição)
//   direita  = o CONTATO (selecionar existente — inclusive quem está só no
//              chat — ou criar novo)

type ContactHit = {
  id: string;
  name: string;
  phone: string | null;
  avatar_url: string | null;
  pipeline: string | null;
  stage: string | null;
};

export function NewLeadDialog({
  pipelineId,
  stageId,
  team = [],
  onClose,
}: {
  pipelineId: string;
  stageId: string;
  team?: Profile[];
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // negócio
  const [value, setValue] = useState("");
  const [source, setSource] = useState<LeadSource>("manual");
  const [ownerId, setOwnerId] = useState("");
  const [description, setDescription] = useState("");

  // contato
  const [mode, setMode] = useState<"existente" | "novo">("existente");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ContactHit[]>([]);
  const [picked, setPicked] = useState<ContactHit | null>(null);
  const [newContact, setNewContact] = useState({
    name: "",
    phone: "",
    company: "",
    email: "",
    instagram: "",
  });

  // busca contatos (RLS aplica) enquanto digita
  useEffect(() => {
    if (mode !== "existente" || picked) return;
    const term = query.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("search_leads", { q: term });
      setHits(((data ?? []) as ContactHit[]).slice(0, 6));
    }, 250);
    return () => clearTimeout(t);
  }, [query, mode, picked, supabase]);

  const canSave =
    mode === "existente" ? !!picked : !!newContact.name.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || loading) return;
    setLoading(true);
    setError(null);
    const numValue = value
      ? Number(value.replace(/\./g, "").replace(",", ".")) || 0
      : 0;

    if (mode === "existente" && picked) {
      const r = await attachDeal({
        leadId: picked.id,
        pipeline_id: pipelineId,
        stage_id: stageId,
        value: numValue,
        source,
        owner_id: ownerId || null,
        description: description || null,
      });
      if (r && "error" in r && r.error) {
        setError(r.error);
        setLoading(false);
        return;
      }
    } else {
      const r = await createLead({
        name: newContact.name.trim(),
        phone: newContact.phone,
        email: newContact.email,
        company: newContact.company,
        instagram: newContact.instagram,
        value: numValue,
        source,
        pipeline_id: pipelineId,
        stage_id: stageId,
        owner_id: ownerId || null,
      });
      if (r && "error" in r && r.error) {
        setError(r.error);
        setLoading(false);
        return;
      }
      if (r && "id" in r && r.id && description.trim()) {
        await addNote(r.id, description.trim());
      }
    }
    router.refresh();
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Adicionar negócio"
      size="3xl"
      dismissible={!loading}
      footer={
        <>
          {error && (
            <p className="mr-auto rounded-lg bg-[var(--color-danger)]/10 px-3 py-1.5 text-xs text-[var(--color-danger)]">
              {error}
            </p>
          )}
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="new-lead-form" disabled={loading || !canSave}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </>
      }
    >
      <form
        id="new-lead-form"
        onSubmit={submit}
        className="grid gap-6 md:grid-cols-2 md:gap-0 md:divide-x md:divide-[var(--color-border)]"
      >
        {/* ------- negócio ------- */}
        <div className="space-y-3.5 md:pr-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-2)]">
              Informações do negócio
            </p>
            <Field label="Valor (R$)" htmlFor="lead-value">
              <Input
                id="lead-value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                autoFocus
              />
            </Field>
            <Field label="Origem" htmlFor="lead-source" required>
              <select
                id="lead-source"
                value={source}
                onChange={(e) => setSource(e.target.value as LeadSource)}
                className="h-10 w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              >
                {Object.entries(SOURCE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Responsável" htmlFor="lead-owner">
              <select
                id="lead-owner"
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="h-10 w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              >
                <option value="">Sem responsável</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Descrição" htmlFor="lead-description">
              <Textarea
                id="lead-description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Contexto do negócio (vira a primeira anotação do card)"
              />
            </Field>
          </div>

          {/* ------- contato ------- */}
          <div className="space-y-3.5 md:pl-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-2)]">
              Informações do contato
            </p>

            {/* seletor existente | novo */}
            <div className="flex gap-4">
              {(
                [
                  ["existente", "Selecionar existente"],
                  ["novo", "Criar novo"],
                ] as const
              ).map(([k, label]) => (
                <label
                  key={k}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  {/* input antes do span: peer-focus-visible só alcança irmãos seguintes no DOM */}
                  <input
                    type="radio"
                    className="peer sr-only"
                    checked={mode === k}
                    onChange={() => {
                      setMode(k);
                      setError(null);
                    }}
                  />
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full border-2 transition peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-primary)] ${
                      mode === k
                        ? "border-[var(--color-primary)]"
                        : "border-[var(--color-border-strong)]"
                    }`}
                  >
                    {mode === k && (
                      <span className="h-2 w-2 rounded-full bg-[var(--color-primary)]" />
                    )}
                  </span>
                  {label}
                </label>
              ))}
            </div>

            {mode === "existente" ? (
              picked ? (
                <div className="flex items-center gap-2.5 rounded-lg border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/6 px-3 py-2.5">
                  <Avatar name={picked.name} src={picked.avatar_url} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{picked.name}</p>
                    <p className="truncate text-[11px] text-[var(--color-muted-2)]">
                      {picked.phone ?? "sem telefone"}
                      {picked.pipeline
                        ? ` · já em ${picked.pipeline}`
                        : " · só no chat"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPicked(null);
                      setQuery("");
                    }}
                    className="grid min-h-9 min-w-9 shrink-0 place-items-center rounded-[var(--radius-control)] text-[var(--color-muted-2)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                    aria-label="Trocar contato"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div>
                  <Field label="Nome do contato" htmlFor="lead-contact-query">
                    <div className="flex h-10 items-center gap-2 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 transition focus-within:border-[var(--color-primary)]">
                      <input
                        id="lead-contact-query"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Pesquise por contato"
                        className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-muted-2)]"
                      />
                      <Search className="h-4 w-4 shrink-0 text-[var(--color-muted-2)]" />
                    </div>
                  </Field>
                  {hits.length > 0 && (
                    <div className="mt-2 divide-y divide-[var(--color-border)]/60 overflow-hidden rounded-lg border border-[var(--color-border)]">
                      {hits.map((h) => (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => setPicked(h)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                        >
                          <Avatar name={h.name} src={h.avatar_url} size={28} />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">
                              {h.name}
                            </p>
                            <p className="truncate text-[11px] text-[var(--color-muted-2)]">
                              {h.phone ?? "sem telefone"}
                              {h.pipeline ? ` · em ${h.pipeline}` : " · só no chat"}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {query.trim().length >= 2 && hits.length === 0 && (
                    <p className="mt-2 text-xs text-[var(--color-muted-2)]">
                      Nenhum contato encontrado — use &ldquo;Criar novo&rdquo;.
                    </p>
                  )}
                </div>
              )
            ) : (
              <div className="space-y-3">
                <Field label="Nome" htmlFor="lead-new-name" required>
                  <Input
                    id="lead-new-name"
                    value={newContact.name}
                    onChange={(e) =>
                      setNewContact((c) => ({ ...c, name: e.target.value }))
                    }
                  />
                </Field>
                <Field label="WhatsApp" htmlFor="lead-new-phone">
                  <Input
                    id="lead-new-phone"
                    value={newContact.phone}
                    onChange={(e) =>
                      setNewContact((c) => ({ ...c, phone: e.target.value }))
                    }
                    placeholder="5511999998888"
                  />
                </Field>
                <Field label="Empresa" htmlFor="lead-new-company">
                  <Input
                    id="lead-new-company"
                    value={newContact.company}
                    onChange={(e) =>
                      setNewContact((c) => ({ ...c, company: e.target.value }))
                    }
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="E-mail" htmlFor="lead-new-email">
                    <Input
                      id="lead-new-email"
                      type="email"
                      value={newContact.email}
                      onChange={(e) =>
                        setNewContact((c) => ({ ...c, email: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Instagram" htmlFor="lead-new-instagram">
                    <Input
                      id="lead-new-instagram"
                      value={newContact.instagram}
                      onChange={(e) =>
                        setNewContact((c) => ({
                          ...c,
                          instagram: e.target.value,
                        }))
                      }
                      placeholder="@"
                    />
                  </Field>
                </div>
              </div>
            )}
          </div>
        </form>
      </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  required = false,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-xs font-medium text-[var(--color-muted)]"
      >
        {label}
        {required && <span className="text-[var(--color-danger)]"> *</span>}
      </label>
      {children}
    </div>
  );
}
