"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  FileSignature,
  FilePen,
  FileCheck2,
  FileX2,
  Archive,
  Clock,
  Plus,
  Send,
  RefreshCw,
  Link2,
  FileText,
  Trash2,
  CheckCircle2,
  X,
  ClipboardList,
  PenLine,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, currencyBRL } from "@/lib/utils/ui";
import { maskCpf, maskCnpj } from "@/lib/utils/masks";
import { toast } from "@/components/ui/toast";
import {
  createContract,
  createFormRequest,
  resendFormRequest,
  cancelFormRequest,
  generateContractFromTemplate,
  sendContractForSignature,
  refreshContractStatus,
  getContractPdfUrl,
  closeContract,
  deleteContract,
} from "@/app/(dashboard)/contratos/actions";

export type ContractRow = {
  id: string;
  title: string;
  value: number | null;
  starts_at: string | null;
  ends_at: string | null;
  status: "rascunho" | "enviado" | "assinado" | "recusado" | "encerrado";
  sign_link: string | null;
  signer_email: string | null;
  sent_at: string | null;
  signed_at: string | null;
  created_at: string;
  lead: {
    id: string;
    code: number | null;
    name: string;
    phone: string | null;
    avatar_url: string | null;
  } | null;
};

export type LeadOption = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  pipeline_id: string | null;
};

export type FormRequestRow = {
  id: string;
  token: string;
  status: "pendente" | "respondido";
  created_at: string;
  answered_at: string | null;
  lead: { name: string } | null;
};

// Cores semânticas (VibeUX): verde = concluído, âmbar = atenção, vermelho =
// negativo, cinza = neutro. Azul da marca fica pros CTAs, não pra status.
// `tone` alimenta o <Badge>; `iconBox` é o selo redondo sobre o avatar (não
// tem o formato de pílula do Badge, por isso continua com classes próprias).
const STATUS_META: Record<
  ContractRow["status"],
  {
    label: string;
    icon: LucideIcon;
    tone: "neutral" | "warning" | "success" | "danger";
    iconBox: string;
  }
> = {
  rascunho: {
    label: "Rascunho",
    icon: FilePen,
    tone: "neutral",
    iconBox: "bg-[var(--color-surface-2)] text-[var(--color-muted)]",
  },
  enviado: {
    label: "Aguardando assinatura",
    icon: Clock,
    tone: "warning",
    iconBox:
      "bg-[color-mix(in_srgb,var(--color-warning)_12%,var(--color-surface))] text-[var(--color-warning)]",
  },
  assinado: {
    label: "Assinado",
    icon: FileCheck2,
    tone: "success",
    iconBox:
      "bg-[color-mix(in_srgb,var(--color-success)_12%,var(--color-surface))] text-[var(--color-success)]",
  },
  recusado: {
    label: "Recusado",
    icon: FileX2,
    tone: "danger",
    iconBox: "bg-[var(--color-danger)]/10 text-[var(--color-danger)]",
  },
  encerrado: {
    label: "Encerrado",
    icon: Archive,
    tone: "neutral",
    iconBox: "bg-[var(--color-surface-2)] text-[var(--color-muted-2)]",
  },
};

type Filter = "todos" | ContractRow["status"];
type Mode = "opsform" | "modelo" | "upload";

const MODES: {
  key: Mode;
  title: string;
  desc: string;
  icon: LucideIcon;
}[] = [
  {
    key: "opsform",
    title: "OPS Form",
    desc: "O cliente preenche os dados pelo link no WhatsApp e o contrato nasce sozinho.",
    icon: ClipboardList,
  },
  {
    key: "modelo",
    title: "Preencher aqui",
    desc: "Sua equipe preenche os dados e o PDF é gerado na hora, do modelo oficial.",
    icon: PenLine,
  },
  {
    key: "upload",
    title: "Anexar PDF",
    desc: "Já tem o contrato pronto? Anexa o arquivo e segue pro fluxo de assinatura.",
    icon: Upload,
  },
];

/** Tooltip de dúvida (VibeUX 73): explica sem poluir a interface. */
function Tip({ text }: { text: string }) {
  return (
    <span
      title={text}
      className="ml-1 inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[11px] font-semibold leading-none text-[var(--color-muted-2)]"
    >
      ?
    </span>
  );
}

export function ContractsView({
  contracts,
  leads,
  formRequests,
  integrationReady,
}: {
  contracts: ContractRow[];
  leads: LeadOption[];
  formRequests: FormRequestRow[];
  integrationReady: boolean;
}) {
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

  const dt = (s: string | null) =>
    s ? new Date(s).toLocaleDateString("pt-BR") : "—";

  const inputCls =
    "h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]";
  const labelCls =
    "flex flex-col gap-1.5 text-xs font-medium text-[var(--color-muted)]";
  const sectionCls =
    "text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-muted-2)]";

  // Tiles de status clicáveis = filtro (mesmo padrão das Tarefas)
  const tiles: { key: Filter; label: string; icon: LucideIcon; sub?: string }[] =
    [
      { key: "todos", label: "Todos", icon: FileSignature },
      { key: "rascunho", label: "Rascunhos", icon: FilePen },
      { key: "enviado", label: "Aguardando", icon: Clock },
      {
        key: "assinado",
        label: "Assinados",
        icon: FileCheck2,
        sub: valorAssinado > 0 ? currencyBRL(valorAssinado) : undefined,
      },
      { key: "recusado", label: "Recusados", icon: FileX2 },
    ];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        {/* Cabeçalho */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              <FileSignature className="h-5 w-5 text-[var(--color-primary)]" />
              Contratos
            </h1>
            <p className="mt-0.5 text-xs text-[var(--color-muted-2)]">
              Do envio à assinatura digital, sem sair do sistema
            </p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className={cn(
              "ml-auto flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-medium transition",
              showForm
                ? "border border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
                : "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-sm hover:opacity-90"
            )}
          >
            {showForm ? (
              <>
                <X className="h-4 w-4" />
                Fechar
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Novo contrato
              </>
            )}
          </button>
        </div>

        {/* Tiles de status (clicáveis = filtro) */}
        <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {tiles.map((t) => {
            const active = filter === t.key;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={cn(
                  "card flex flex-col gap-1.5 rounded-2xl p-3.5 text-left transition",
                  active
                    ? "ring-2 ring-[var(--color-primary)]"
                    : "hover:bg-[var(--color-surface-2)]/50"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--color-muted)]">
                    {t.label}
                  </span>
                  <Icon
                    className={cn(
                      "h-4 w-4",
                      active
                        ? "text-[var(--color-primary)]"
                        : "text-[var(--color-muted-2)]"
                    )}
                  />
                </div>
                <span className="text-2xl font-semibold tabular-nums leading-none">
                  {counts[t.key] ?? 0}
                </span>
                {t.sub && (
                  <span className="text-[11px] font-medium text-[var(--color-success)]">
                    {t.sub}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {!integrationReady && (
          <div className="mb-5 rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-4 py-3 text-sm text-[var(--color-warning)]">
            <strong>Autentique aguardando token.</strong> Você já pode criar
            contratos; o envio pra assinatura ativa quando o token da API for
            configurado.
          </div>
        )}

        {notice && (
          <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-[var(--color-success)]/25 bg-[var(--color-success)]/8 px-4 py-3 text-sm text-[var(--color-success)]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{notice}</span>
            <button
              onClick={() => setNotice(null)}
              aria-label="Fechar aviso"
              className="text-[var(--color-success)]/60 transition hover:text-[var(--color-success)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ---------------- Novo contrato ---------------- */}
        {showForm && (
          <div className="card mb-6 rounded-2xl p-4 sm:p-5">
            {/* 1. Como criar */}
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

            <form ref={formRef} onSubmit={submitNew}>
              {/* 2. Cliente e termos */}
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
                      O cliente recebe o link no WhatsApp, escolhe se contrata
                      como pessoa física ou empresa e preenche os próprios
                      dados. Quando ele terminar, o contrato aparece aqui como
                      rascunho, pronto pra revisar e enviar.
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

              {/* 3. Dados do contratante (só no modo "Preencher aqui") */}
              {mode === "modelo" && (
                <>
                  <p className={cn(sectionCls, "mb-2.5 mt-5")}>
                    3 · Dados do contratante
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {tipoContrato === "pj" && (
                      <>
                        <label className={labelCls}>
                          Razão social *
                          <input
                            name="nome"
                            required
                            placeholder="Como está no cartão CNPJ"
                            className={inputCls}
                          />
                        </label>
                        <label className={labelCls}>
                          CNPJ *
                          <input
                            name="cnpj"
                            required
                            placeholder="00.000.000/0000-00"
                            inputMode="numeric"
                            onChange={(e) => {
                              e.currentTarget.value = maskCnpj(
                                e.currentTarget.value
                              );
                            }}
                            className={inputCls}
                          />
                        </label>
                        <label className={labelCls}>
                          Quem assina pela empresa *
                          <input
                            name="representante"
                            required
                            placeholder="Nome completo"
                            className={inputCls}
                          />
                        </label>
                      </>
                    )}
                    <label className={labelCls}>
                      CPF * {tipoContrato === "pj" ? "(de quem assina)" : ""}
                      <input
                        name="cpf"
                        required
                        placeholder="000.000.000-00"
                        inputMode="numeric"
                        onChange={(e) => {
                          e.currentTarget.value = maskCpf(e.currentTarget.value);
                        }}
                        className={inputCls}
                      />
                    </label>
                    <label className={cn(labelCls, "sm:col-span-2")}>
                      Endereço completo *
                      <input
                        name="endereco"
                        required
                        placeholder="Rua, nº, bairro, cidade – UF, CEP"
                        className={inputCls}
                      />
                    </label>
                    <label className={labelCls}>
                      E-mail do cliente *
                      <input
                        name="email"
                        type="email"
                        placeholder="Vai no contrato e na Autentique"
                        className={inputCls}
                      />
                    </label>
                    <label className={labelCls}>
                      Telefone (vazio = usa o do cadastro)
                      <input name="telefone" className={inputCls} />
                    </label>
                    <label className={labelCls}>
                      Empresa do cliente (opcional)
                      <input
                        name="empresa"
                        placeholder="Entra como titular/representante dela"
                        className={inputCls}
                      />
                    </label>
                    <label className={labelCls}>
                      Nacionalidade (opcional)
                      <input
                        name="nacionalidade"
                        defaultValue="brasileiro(a)"
                        className={inputCls}
                      />
                    </label>
                    <label className={labelCls}>
                      Estado civil (opcional)
                      <input
                        name="estado_civil"
                        placeholder="Ex.: casado(a)"
                        className={inputCls}
                      />
                    </label>
                    <label className={labelCls}>
                      Profissão (opcional)
                      <input
                        name="profissao"
                        placeholder="Ex.: empresário(a)"
                        className={inputCls}
                      />
                    </label>
                    <label className={labelCls}>
                      RG (opcional)
                      <input name="rg" className={inputCls} />
                    </label>
                  </div>
                </>
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
        )}

        {/* ---------------- OPS Forms enviados ---------------- */}
        {formRequests.length > 0 && (
          <div className="card mb-6 overflow-hidden rounded-2xl">
            <p className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-muted-2)]">
              <ClipboardList className="h-3.5 w-3.5" />
              OPS Forms enviados
            </p>
            {formRequests.map((f) => (
              <div
                key={f.id}
                className="flex flex-wrap items-center gap-2.5 border-b border-[var(--color-border)] px-4 py-2.5 last:border-0"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {f.lead?.name ?? "—"}
                </span>
                <span className="text-[11px] tabular-nums text-[var(--color-muted-2)]">
                  {new Date(f.created_at).toLocaleDateString("pt-BR")}
                </span>
                <Badge tone={f.status === "respondido" ? "success" : "warning"}>
                  {f.status === "respondido" ? "Respondido" : "Aguardando cliente"}
                </Badge>
                <div className="flex items-center gap-1">
                  <button
                    title="Copiar link do formulário"
                    aria-label="Copiar link do formulário"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${window.location.origin}/f/${f.token}`
                      );
                      setNotice("Link do OPS Form copiado.");
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                  >
                    <Link2 className="h-4 w-4" />
                  </button>
                  {f.status === "pendente" && (
                    <>
                      <button
                        title="Reenviar lembrete pelo WhatsApp"
                        aria-label="Reenviar lembrete pelo WhatsApp"
                        disabled={busy === f.id}
                        onClick={() =>
                          run(f.id, async () => {
                            const r = await resendFormRequest(f.id);
                            if (r?.error) return r;
                            setNotice("Lembrete reenviado no WhatsApp.");
                          })
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                      <button
                        title="Cancelar formulário"
                        aria-label="Cancelar formulário"
                        disabled={busy === f.id}
                        onClick={() => {
                          if (
                            confirm(
                              "Cancelar esse OPS Form? O link para de funcionar."
                            )
                          )
                            run(f.id, () => cancelFormRequest(f.id));
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ---------------- Lista de contratos ---------------- */}
        {list.length === 0 ? (
          <div className="card flex flex-col items-center gap-3 rounded-2xl p-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <FileSignature className="h-7 w-7" />
            </div>
            {filter === "todos" ? (
              <>
                <p className="text-sm font-medium">
                  Nenhum contrato por aqui ainda
                </p>
                <p className="max-w-sm text-sm text-[var(--color-muted)]">
                  Crie o primeiro: o cliente preenche os dados pelo OPS Form, o
                  PDF nasce sozinho e a assinatura vai pelo WhatsApp.
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
        ) : (
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
                          // revisão antes do fluxo crítico (VibeUX 77)
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
                          if (r?.error) return r;
                          if (r.url) window.open(r.url, "_blank");
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
        )}
      </div>
    </div>
  );
}
