"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  MessageCircle,
  Handshake,
  Plus,
  Users,
  UserPlus,
  X,
  Mail,
  Phone,
  Building2,
  CalendarDays,
  UserRound,
  Loader2,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Drawer } from "@/components/ui/dialog";
import { cn, formatPhone } from "@/lib/utils";
import { maskPhoneBR } from "@/lib/masks";
import { toast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import {
  attachLeadToPipeline,
  createContact,
} from "@/app/(dashboard)/crm/actions";

export type ContactRow = {
  id: string;
  code: number | null;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  avatar_url: string | null;
  pipeline_id: string | null;
  created_at: string;
  owner: { name: string } | null;
};

type Filter = "todos" | "funil" | "contato";

export function ContactsView({ contacts }: { contacts: ContactRow[] }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  // Gaveta lateral (VibeUX 59): clique na linha abre os detalhes do contato
  // sem sair do contexto — volume intermediário de dados não pede página.
  const [drawer, setDrawer] = useState<ContactRow | null>(null);
  const [lastMsgs, setLastMsgs] = useState<
    { body: string | null; direction: "in" | "out"; created_at: string; media_type: string | null }[]
  >([]);
  const [msgsLoading, setMsgsLoading] = useState(false);

  useEffect(() => {
    if (!drawer) return;
    setMsgsLoading(true);
    setLastMsgs([]);
    supabase
      .from("whatsapp_messages")
      .select("body, direction, created_at, media_type")
      .eq("lead_id", drawer.id)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        setLastMsgs(
          (data ?? []) as {
            body: string | null;
            direction: "in" | "out";
            created_at: string;
            media_type: string | null;
          }[]
        );
        setMsgsLoading(false);
      });
  }, [drawer, supabase]);

  async function submitNewContact(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    const r = await createContact({
      name: String(f.get("name") ?? ""),
      phone: String(f.get("phone") ?? ""),
      email: String(f.get("email") ?? ""),
      company: String(f.get("company") ?? ""),
    });
    setSaving(false);
    if (r?.error) {
      toast(r.error, { type: "error" });
      return;
    }
    setShowNew(false);
    toast("Contato criado.");
    router.refresh();
  }

  const counts = useMemo(
    () => ({
      todos: contacts.length,
      funil: contacts.filter((c) => c.pipeline_id).length,
      contato: contacts.filter((c) => !c.pipeline_id).length,
    }),
    [contacts]
  );

  const list = useMemo(() => {
    const norm = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(new RegExp("[\\u0300-\\u036f]", "g"), "");
    const query = norm(q.trim());
    const digits = q.replace(/\D/g, "");
    return contacts.filter((c) => {
      if (filter === "funil" && !c.pipeline_id) return false;
      if (filter === "contato" && c.pipeline_id) return false;
      if (!query && !digits) return true;
      if (query && norm(c.name).includes(query)) return true;
      if (query && c.company && norm(c.company).includes(query)) return true;
      if (query && c.email && norm(c.email).includes(query)) return true;
      if (digits && (c.phone ?? "").replace(/\D/g, "").includes(digits))
        return true;
      if (digits && String(c.code ?? "") === digits) return true;
      return false;
    });
  }, [contacts, q, filter]);

  function criarNegocio(c: ContactRow) {
    setPendingId(c.id);
    startTransition(async () => {
      const r = await attachLeadToPipeline(c.id);
      setPendingId(null);
      if (r?.error) toast(r.error, { type: "error" });
      else {
        toast("Negócio criado no funil.");
        router.refresh();
      }
    });
  }

  const chip = (f: Filter, label: string) => (
    <button
      key={f}
      onClick={() => setFilter(f)}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
        filter === f
          ? "border-transparent bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
          : "border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-[11px] font-semibold",
          filter === f
            ? "bg-[var(--color-primary-foreground)]/25"
            : "bg-[var(--color-surface-2)] text-[var(--color-muted-2)]"
        )}
      >
        {counts[f]}
      </span>
    </button>
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        {/* Cabeçalho + busca */}
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Users className="h-5 w-5 text-[var(--color-primary)]" />
            Contatos
          </h1>
          <div className="relative min-w-0 flex-1 basis-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-2)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome, telefone, código #, empresa..."
              className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 text-sm outline-none transition focus:border-[var(--color-primary)]"
            />
          </div>
          <button
            onClick={() => setShowNew((v) => !v)}
            className={cn(
              "flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-4 text-sm font-medium transition",
              showNew
                ? "border border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
                : "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-sm hover:opacity-90"
            )}
          >
            {showNew ? (
              <>
                <X className="h-4 w-4" />
                Fechar
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" />
                Novo contato
              </>
            )}
          </button>
        </div>

        {/* Novo contato (sem card — contato ≠ negócio) */}
        {showNew && (
          <form
            onSubmit={submitNewContact}
            className="card mb-4 grid gap-3 rounded-2xl p-4 sm:grid-cols-2"
          >
            <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--color-muted)]">
              Nome *
              <input
                name="name"
                required
                placeholder="Nome do contato"
                className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--color-muted)]">
              WhatsApp (com DDD)
              <input
                name="phone"
                inputMode="tel"
                placeholder="(64) 99999-0000"
                onChange={(e) => {
                  e.currentTarget.value = maskPhoneBR(e.currentTarget.value);
                }}
                className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--color-muted)]">
              E-mail
              <input
                name="email"
                type="email"
                placeholder="contato@email.com"
                className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--color-muted)]">
              Empresa
              <input
                name="company"
                placeholder="Empresa do contato"
                className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]"
              />
            </label>
            <div className="flex items-center justify-end gap-2.5 sm:col-span-2">
              <button
                type="button"
                onClick={() => setShowNew(false)}
                className="h-10 px-3 text-sm text-[var(--color-muted)] transition hover:text-[var(--color-foreground)]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex h-10 items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-5 text-sm font-medium text-[var(--color-primary-foreground)] shadow-sm transition hover:opacity-90 disabled:opacity-50"
              >
                <UserPlus className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar contato"}
              </button>
            </div>
            <p className="text-xs leading-relaxed text-[var(--color-muted-2)] sm:col-span-2">
              O contato entra na base sem card no funil — dá pra vincular
              contratos, conversar no chat e, quando fizer sentido, promover a
              negócio.
            </p>
          </form>
        )}

        {/* Filtros */}
        <div className="mb-4 flex flex-wrap gap-2">
          {chip("todos", "Todos")}
          {chip("funil", "No funil")}
          {chip("contato", "Só contato")}
        </div>

        {/* Lista */}
        {list.length === 0 ? (
          <div className="card flex flex-col items-center gap-2 rounded-2xl p-10 text-center">
            <Users className="h-8 w-8 text-[var(--color-muted-2)]" />
            <p className="text-sm text-[var(--color-muted)]">
              {q
                ? "Nenhum contato encontrado pra essa busca."
                : "Nenhum contato ainda — eles nascem sozinhos quando alguém chama no WhatsApp."}
            </p>
          </div>
        ) : (
          <div className="card overflow-hidden rounded-2xl">
            {/* Desktop: tabela */}
            <table className="hidden w-full text-sm sm:table">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted-2)]">
                  <th scope="col" className="px-4 py-3 font-medium">Contato</th>
                  <th scope="col" className="px-4 py-3 font-medium">Telefone</th>
                  <th scope="col" className="px-4 py-3 font-medium">Empresa</th>
                  <th scope="col" className="px-4 py-3 font-medium">Responsável</th>
                  <th scope="col" className="px-4 py-3 font-medium">Situação</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setDrawer(c)}
                    className="cursor-pointer border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]/50"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={c.name} src={c.avatar_url} size={32} alt="" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{c.name}</p>
                          {c.code != null && (
                            <p className="text-[11px] text-[var(--color-muted-2)]">
                              #{c.code}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[var(--color-muted)]">
                      {c.phone ? formatPhone(c.phone) : "—"}
                    </td>
                    <td className="max-w-40 truncate px-4 py-2.5 text-[var(--color-muted)]">
                      {c.company ?? "—"}
                    </td>
                    <td className="max-w-36 truncate px-4 py-2.5 text-[var(--color-muted)]">
                      {c.owner?.name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium",
                          c.pipeline_id
                            ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                            : "bg-[var(--color-surface-2)] text-[var(--color-muted)]"
                        )}
                      >
                        {c.pipeline_id ? "No funil" : "Contato"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/chat?lead=${c.id}`}
                          title="Abrir no OPS Chat"
                          aria-label="Abrir no OPS Chat"
                          onClick={(e) => e.stopPropagation()}
                          className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Link>
                        {c.pipeline_id ? (
                          <Link
                            href={`/crm/leads/${c.code ?? c.id}`}
                            title="Ver negócio"
                            aria-label="Ver negócio"
                            onClick={(e) => e.stopPropagation()}
                            className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                          >
                            <Handshake className="h-4 w-4" />
                          </Link>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              criarNegocio(c);
                            }}
                            disabled={pendingId === c.id}
                            className="flex h-8 items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 text-xs font-medium text-[var(--color-muted)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            {pendingId === c.id ? "Criando..." : "Negócio"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile: lista compacta */}
            <ul className="sm:hidden">
              {list.map((c) => (
                <li
                  key={c.id}
                  onClick={() => setDrawer(c)}
                  className="flex cursor-pointer items-center gap-3 border-b border-[var(--color-border)] px-3 py-2.5 last:border-0"
                >
                  <Avatar name={c.name} src={c.avatar_url} size={36} alt="" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {c.name}
                      {c.code != null && (
                        <span className="ml-1.5 text-[11px] font-normal text-[var(--color-muted-2)]">
                          #{c.code}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-[var(--color-muted)]">
                      {c.phone ? formatPhone(c.phone) : c.email ?? "—"}
                    </p>
                  </div>
                  <Link
                    href={`/chat?lead=${c.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--color-muted)] transition hover:text-[var(--color-primary)]"
                    aria-label="Abrir no OPS Chat"
                  >
                    <MessageCircle className="h-5 w-5" />
                  </Link>
                  {c.pipeline_id ? (
                    <Link
                      href={`/crm/leads/${c.code ?? c.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--color-muted)] transition hover:text-[var(--color-primary)]"
                      aria-label="Ver negócio"
                    >
                      <Handshake className="h-5 w-5" />
                    </Link>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        criarNegocio(c);
                      }}
                      disabled={pendingId === c.id}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--color-muted)] transition hover:text-[var(--color-primary)] disabled:opacity-50"
                      aria-label="Criar negócio"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Gaveta lateral do contato (VibeUX 59) */}
      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        size="md"
        title={
          drawer && (
            <div className="flex items-center gap-3">
              <Avatar name={drawer.name} src={drawer.avatar_url} size={44} alt="" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold">{drawer.name}</p>
                <p className="text-xs text-[var(--color-muted)]">
                  {drawer.code != null && `#${drawer.code} · `}
                  {drawer.pipeline_id ? "No funil" : "Contato"}
                </p>
              </div>
            </div>
          )
        }
        footer={
          drawer && (
            <>
              <Link
                href={`/chat?lead=${drawer.id}`}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] text-sm font-medium text-[var(--color-primary-foreground)] shadow-sm transition hover:opacity-90"
              >
                <MessageCircle className="h-4 w-4" />
                Abrir no OPS Chat
              </Link>
              {drawer.pipeline_id ? (
                <Link
                  href={`/crm/leads/${drawer.code ?? drawer.id}`}
                  className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] text-sm font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]"
                >
                  <Handshake className="h-4 w-4" />
                  Ver negócio
                </Link>
              ) : (
                <button
                  onClick={() => {
                    criarNegocio(drawer);
                    setDrawer(null);
                  }}
                  disabled={pendingId === drawer.id}
                  className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] text-sm font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  Criar negócio
                </button>
              )}
            </>
          )
        }
      >
        {drawer && (
          <div className="space-y-5">
            <div className="space-y-2.5">
              <InfoRow
                icon={Phone}
                label="WhatsApp"
                value={drawer.phone ? formatPhone(drawer.phone) : "—"}
              />
              <InfoRow icon={Mail} label="E-mail" value={drawer.email ?? "—"} />
              <InfoRow
                icon={Building2}
                label="Empresa"
                value={drawer.company ?? "—"}
              />
              <InfoRow
                icon={UserRound}
                label="Responsável"
                value={drawer.owner?.name ?? "—"}
              />
              <InfoRow
                icon={CalendarDays}
                label="Contato desde"
                value={new Date(drawer.created_at).toLocaleDateString("pt-BR")}
              />
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-2)]">
                Últimas mensagens
              </p>
              {msgsLoading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-[var(--color-muted-2)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando...
                </div>
              ) : lastMsgs.length === 0 ? (
                <p className="py-2 text-sm text-[var(--color-muted-2)]">
                  Nenhuma conversa ainda — puxa o assunto no OPS Chat.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {lastMsgs.map((m, i) => (
                    <li
                      key={i}
                      className={cn(
                        "rounded-xl px-3 py-2 text-sm",
                        m.direction === "out"
                          ? "bg-[var(--color-primary)]/8"
                          : "bg-[var(--color-surface-2)]"
                      )}
                    >
                      <p className="mb-0.5 text-[11px] font-medium text-[var(--color-muted-2)]">
                        {m.direction === "out" ? "Você" : drawer.name.split(" ")[0]}{" "}
                        ·{" "}
                        {new Date(m.created_at).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                        })}{" "}
                        {new Date(m.created_at).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      <p className="line-clamp-2 break-words">
                        {m.body?.trim() ||
                          (m.media_type ? `[${m.media_type}]` : "—")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-2)] text-[var(--color-muted)]">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] text-[var(--color-muted-2)]">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}
