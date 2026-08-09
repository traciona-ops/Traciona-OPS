"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, Trash2, UserPlus, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/ui";
import {
  createTeamMember,
  updateMemberRole,
  updateMemberSector,
  toggleMemberActive,
  deleteTeamMember,
} from "@/app/(dashboard)/settings/actions";
import { type Profile, type UserRole, type Sector } from "@/lib/types";
import { SECTOR } from "@/lib/data/labels";

// Usuários da equipe em tabela (estilo Groner): toggle Ativo, filtro
// Ativos/Todos, busca e criação inline. Ações reusam as server actions.

const ROLES: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "gestor", label: "Gestor" },
  { value: "vendedor", label: "Vendedor" },
];

const SECTORS = Object.keys(SECTOR) as Sector[];

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function TeamTable({
  initialTeam,
  currentUserId,
}: {
  initialTeam: Profile[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [onlyActive, setOnlyActive] = useState(true);
  const [query, setQuery] = useState("");

  const actives = initialTeam.filter((m) => m.active).length;
  const rows = useMemo(() => {
    const q = norm(query.trim());
    return initialTeam.filter((m) => {
      if (onlyActive && !m.active) return false;
      if (!q) return true;
      return norm(m.name).includes(q) || norm(m.email ?? "").includes(q);
    });
  }, [initialTeam, onlyActive, query]);

  // Equipes separadas por setor: cada setor vira um bloco na tabela
  const groups = SECTORS.map((s) => ({
    sector: s,
    members: rows.filter((m) => (m.sector ?? "vendas") === s),
  })).filter((g) => g.members.length);

  return (
    <section className="card overflow-hidden p-0">
      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2 p-4">
        <div className="flex overflow-hidden rounded-xl border border-[var(--color-border)]">
          {(
            [
              [true, "Ativos"],
              [false, "Todos"],
            ] as const
          ).map(([val, label]) => (
            <button
              key={label}
              onClick={() => setOnlyActive(val)}
              className={cn(
                "h-10 px-4 text-sm font-medium transition-colors",
                onlyActive === val
                  ? "bg-[var(--color-foreground)] text-[var(--color-background)]"
                  : "bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="flex h-10 items-center rounded-xl bg-[color-mix(in_srgb,var(--color-success)_12%,var(--color-surface))] px-3 text-sm font-semibold text-[var(--color-success)]">
          {actives}/{initialTeam.length} usuários
        </span>
        <label className="flex h-10 min-w-44 flex-1 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--color-muted-2)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar por usuários"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-muted-2)]"
          />
        </label>
        <Button onClick={() => setAdding((a) => !a)}>
          <UserPlus className="h-4 w-4" />
          Usuário
        </Button>
      </div>

      {adding && (
        <div className="px-4 pb-4">
          <AddMemberForm
            onDone={() => {
              setAdding(false);
              router.refresh();
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-y border-[var(--color-border)] bg-[var(--color-surface-2)]/60 text-left text-xs text-[var(--color-muted)]">
              <th scope="col" className="px-4 py-2.5 font-medium">Ativo</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Nome</th>
              <th scope="col" className="px-3 py-2.5 font-medium">E-mail</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Setor</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Perfil</th>
              <th scope="col" className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.sector}>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/80">
                  <td colSpan={6} className="px-4 py-2">
                    <span className="flex items-center gap-2 text-[13px] font-semibold">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: SECTOR[g.sector].color }}
                      />
                      Setor {SECTOR[g.sector].label}
                      <span className="font-normal text-[var(--color-muted-2)]">
                        · {g.members.length}{" "}
                        {g.members.length === 1 ? "usuário" : "usuários"}
                      </span>
                    </span>
                  </td>
                </tr>
                {g.members.map((m) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    isSelf={m.id === currentUserId}
                    onChanged={() => router.refresh()}
                  />
                ))}
              </Fragment>
            ))}
            {!rows.length && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-sm text-[var(--color-muted)]"
                >
                  {query
                    ? "Nenhum usuário encontrado com essa busca."
                    : "Nenhum usuário por aqui."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MemberRow({
  member,
  isSelf,
  onChanged,
}: {
  member: Profile;
  isSelf: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    await fn();
    setBusy(false);
    onChanged();
  }

  async function remove() {
    if (!confirm(`Remover ${member.name}? Essa ação não pode ser desfeita.`))
      return;
    setBusy(true);
    const r = await deleteTeamMember(member.id);
    setBusy(false);
    if (r && "error" in r) alert(r.error);
    else onChanged();
  }

  return (
    <tr
      className={cn(
        "border-b border-[var(--color-border)] transition-colors last:border-0 hover:bg-[var(--color-surface-2)]/50",
        !member.active && "opacity-55"
      )}
    >
      <td className="px-4 py-2.5">
        <button
          onClick={() => run(() => toggleMemberActive(member.id, !member.active))}
          disabled={busy || isSelf}
          title={
            isSelf
              ? "Você não pode desativar a si mesmo"
              : member.active
              ? "Desativar"
              : "Ativar"
          }
          aria-label={member.active ? "Desativar usuário" : "Ativar usuário"}
          className={cn(
            "relative h-5 w-9 rounded-full transition-colors disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]",
            member.active
              ? "bg-[var(--color-primary)]"
              : "bg-[var(--color-border-strong)]"
          )}
        >
          <span
            className={cn(
              // thumb do switch: continua claro de propósito (contraste sobre a trilha colorida), só troca a fonte pra acompanhar o tema
              "absolute top-0.5 h-4 w-4 rounded-full bg-[var(--color-surface)] shadow transition-all",
              member.active ? "left-[18px]" : "left-0.5"
            )}
          />
        </button>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <Avatar name={member.name} src={member.avatar_url} size={30} alt="" />
          <span className="whitespace-nowrap font-medium">
            {member.name}
            {isSelf && (
              <span className="ml-1.5 text-xs font-normal text-[var(--color-muted)]">
                (você)
              </span>
            )}
          </span>
        </div>
      </td>
      <td className="max-w-52 truncate px-3 py-2.5 text-[var(--color-muted)]">
        {member.email}
      </td>
      <td className="px-3 py-2.5">
        <select
          value={member.sector ?? "vendas"}
          onChange={(e) =>
            run(() => updateMemberSector(member.id, e.target.value as Sector))
          }
          disabled={busy}
          className="h-8 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 text-xs"
          title="Setor"
        >
          {SECTORS.map((s) => (
            <option key={s} value={s}>
              {SECTOR[s].label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2.5">
        <select
          value={member.role}
          onChange={(e) =>
            run(() => updateMemberRole(member.id, e.target.value as UserRole))
          }
          disabled={busy}
          className="h-8 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 text-xs"
          title="Perfil"
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2.5 text-right">
        {!isSelf && (
          <button
            onClick={remove}
            disabled={busy}
            className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            aria-label="Remover"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        )}
      </td>
    </tr>
  );
}

function AddMemberForm({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "vendedor" as UserRole,
    sector: "vendas" as Sector,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const r = await createTeamMember(form);
    if (r && "error" in r) {
      setError(r.error);
      setLoading(false);
      return;
    }
    onDone();
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">Novo usuário</h3>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Fechar"
          className="flex min-h-9 min-w-9 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        >
          <X className="h-4 w-4 text-[var(--color-muted)]" />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          placeholder="Nome"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <Input
          type="email"
          placeholder="E-mail"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
        <Input
          type="text"
          placeholder="Senha (mín. 6)"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
          minLength={6}
        />
        <select
          value={form.role}
          onChange={(e) =>
            setForm({ ...form, role: e.target.value as UserRole })
          }
          className="h-10 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 text-sm"
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <select
          value={form.sector}
          onChange={(e) =>
            setForm({ ...form, sector: e.target.value as Sector })
          }
          className="h-10 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 text-sm"
        >
          {SECTORS.map((s) => (
            <option key={s} value={s}>
              {SECTOR[s].label}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className="mt-3 rounded-lg bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
          {error}
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={loading}>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Criar usuário
        </Button>
      </div>
    </form>
  );
}
