"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Loader2,
  X,
  House,
  UserRound,
  UserPlus,
  Handshake,
  SquareCheckBig,
  FileSignature,
  FilePlus2,
  ShoppingCart,
  LayoutGrid,
  CalendarDays,
  CalendarClock,
  MessageCircle,
  Settings,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { formatPhone } from "@/lib/utils";

// Command bar (VibeUX 34): Ctrl+K busca TUDO — leads, páginas e ações —
// num lugar só, estilo Stripe/Spotlight.

type Result = {
  id: string;
  code: number | null;
  name: string;
  phone: string | null;
  avatar_url: string | null;
  pipeline: string | null;
  stage: string | null;
};

type Command = {
  label: string;
  hint: string;
  href: string;
  icon: LucideIcon;
  keywords: string;
};

const COMMANDS: Command[] = [
  { label: "Início", hint: "Central de controle", href: "/", icon: House, keywords: "inicio home central controle" },
  { label: "Novo contato", hint: "Cadastrar na base", href: "/contatos", icon: UserPlus, keywords: "novo contato criar cadastrar pessoa cliente" },
  { label: "Novo contrato", hint: "OPS Form ou modelo", href: "/contratos", icon: FilePlus2, keywords: "novo contrato criar ops form assinatura" },
  { label: "Contatos", hint: "Base completa", href: "/contatos", icon: UserRound, keywords: "contatos base pessoas" },
  { label: "Negócios", hint: "Funil de vendas", href: "/crm", icon: Handshake, keywords: "negocios funil crm pipeline vendas kanban" },
  { label: "Tarefas Comerciais", hint: "Pendências do time", href: "/atividades", icon: SquareCheckBig, keywords: "tarefas atividades pendencias" },
  { label: "Contratos", hint: "Assinaturas digitais", href: "/contratos", icon: FileSignature, keywords: "contratos assinatura autentique" },
  { label: "Vendas", hint: "Receita e cobranças", href: "/vendas", icon: ShoppingCart, keywords: "vendas receita cobrancas asaas faturas mensalidades mrr financeiro" },
  { label: "OPS Chat", hint: "Conversas do WhatsApp", href: "/chat", icon: MessageCircle, keywords: "chat whatsapp conversas mensagens ops" },
  { label: "Dashboards", hint: "Métricas e KPIs", href: "/dashboards", icon: LayoutGrid, keywords: "dashboards relatorios metricas kpi graficos" },
  { label: "Agenda", hint: "Reuniões e eventos", href: "/agenda", icon: CalendarDays, keywords: "agenda reunioes eventos calendario" },
  { label: "Disponibilidade", hint: "Horários livres", href: "/disponibilidade", icon: CalendarClock, keywords: "disponibilidade horarios livres" },
  { label: "Configurações", hint: "Equipe, números, metas", href: "/settings", icon: Settings, keywords: "configuracoes ajustes equipe numeros whatsapp metas" },
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "");

export function LeadSearch() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Atalho Cmd/Ctrl+K abre a busca
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else {
      setQ("");
      setResults([]);
      setActive(0);
    }
  }, [open]);

  // Busca de leads com debounce
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const id = setTimeout(async () => {
      const { data } = await supabase.rpc("search_leads", { q: term });
      setResults((data ?? []) as Result[]);
      setActive(0);
      setLoading(false);
    }, 220);
    return () => clearTimeout(id);
  }, [q, supabase]);

  // Páginas e ações: sem busca mostra tudo; com busca filtra por nome/keywords
  const cmds = useMemo(() => {
    const term = norm(q.trim());
    if (!term) return COMMANDS;
    return COMMANDS.filter(
      (c) => norm(c.label).includes(term) || c.keywords.includes(term)
    );
  }, [q]);

  const total = cmds.length + results.length;

  function goCmd(c: Command) {
    setOpen(false);
    router.push(c.href);
  }
  function goLead(r: Result) {
    setOpen(false);
    router.push(`/crm/leads/${r.code ?? r.id}`);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, total - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active < cmds.length && cmds[active]) goCmd(cmds[active]);
      else if (results[active - cmds.length]) goLead(results[active - cmds.length]);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border-strong)] px-3 py-1.5 text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Buscar</span>
        <kbd className="hidden rounded border border-[var(--color-border-strong)] px-1 text-[11px] text-[var(--color-muted-2)] sm:inline">
          Ctrl K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Buscar negócios"
            className="card w-full max-w-lg overflow-hidden p-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4">
              <Search className="h-4 w-4 shrink-0 text-[var(--color-muted-2)]" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKey}
                placeholder="Buscar leads, páginas e ações…"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-muted-2)]"
              />
              {loading && (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--color-muted-2)]" />
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-[var(--color-muted-2)] hover:text-[var(--color-foreground)]"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto py-1">
              {cmds.length > 0 && (
                <>
                  <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-2)]">
                    Páginas e ações
                  </p>
                  {cmds.map((c, i) => {
                    const Icon = c.icon;
                    return (
                      <button
                        key={c.label}
                        onClick={() => goCmd(c)}
                        onMouseEnter={() => setActive(i)}
                        className={`flex w-full items-center gap-3 px-4 py-2 text-left ${
                          i === active ? "bg-[var(--color-surface-2)]" : ""
                        }`}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-2)] text-[var(--color-muted)]">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {c.label}
                          </span>
                          <span className="block truncate text-xs text-[var(--color-muted-2)]">
                            {c.hint}
                          </span>
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-2)]" />
                      </button>
                    );
                  })}
                </>
              )}

              {results.length > 0 && (
                <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-2)]">
                  Leads
                </p>
              )}
              {results.map((r, i) => {
                const idx = cmds.length + i;
                return (
                  <button
                    key={r.id}
                    onClick={() => goLead(r)}
                    onMouseEnter={() => setActive(idx)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${
                      idx === active ? "bg-[var(--color-surface-2)]" : ""
                    }`}
                  >
                    <Avatar name={r.name} src={r.avatar_url} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.name}</p>
                      <p className="truncate text-xs tabular-nums text-[var(--color-muted)]">
                        {r.code != null && `#${r.code} · `}
                        {r.phone ? formatPhone(r.phone) : "sem telefone"}
                      </p>
                    </div>
                    {r.pipeline && (
                      <span className="shrink-0 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] text-[var(--color-muted)]">
                        {r.pipeline}
                        {r.stage ? ` · ${r.stage}` : ""}
                      </span>
                    )}
                  </button>
                );
              })}

              {q.trim().length >= 2 && !loading && total === 0 && (
                <p className="px-4 py-6 text-center text-sm text-[var(--color-muted-2)]">
                  Nada encontrado para &ldquo;{q.trim()}&rdquo;.
                </p>
              )}
              {q.trim().length >= 2 &&
                !loading &&
                results.length === 0 &&
                cmds.length > 0 && (
                  <p className="px-4 py-3 text-center text-xs text-[var(--color-muted-2)]">
                    Nenhum lead com esse termo.
                  </p>
                )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
