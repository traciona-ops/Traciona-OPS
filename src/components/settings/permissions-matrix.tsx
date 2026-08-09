"use client";

import { Fragment, useState } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils/ui";
import { toast } from "@/components/ui/toast";
import { MODULES, type ModuleKey } from "@/lib/data/modules";
import { setRolePermission } from "@/app/(dashboard)/settings/permissions-actions";
import type { UserRole } from "@/lib/types";

// Matriz de Permissões de acesso: módulo × perfil. Marcado = pode ver/usar.
// Admin é travado (sempre tudo). Mudanças valem na próxima navegação de
// quem for afetado — esconde do menu e bloqueia a rota.

const ROLES: { role: UserRole; label: string; locked?: boolean }[] = [
  { role: "admin", label: "Admin", locked: true },
  { role: "gestor", label: "Gestor" },
  { role: "vendedor", label: "Vendedor" },
];

export function PermissionsMatrix({
  initialDenials,
}: {
  initialDenials: Record<string, string[]>;
}) {
  const [denials, setDenials] = useState<Record<string, Set<string>>>({
    gestor: new Set(initialDenials.gestor ?? []),
    vendedor: new Set(initialDenials.vendedor ?? []),
  });
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(role: UserRole, module: ModuleKey) {
    const key = `${role}:${module}`;
    const currentlyAllowed = !denials[role]?.has(module);
    const nextAllowed = !currentlyAllowed;
    setBusy(key);
    const r = await setRolePermission(role, module, nextAllowed);
    setBusy(null);
    if (r?.error) {
      toast(r.error, { type: "error" });
      return;
    }
    setDenials((prev) => {
      const next = new Set(prev[role]);
      if (nextAllowed) next.delete(module);
      else next.add(module);
      return { ...prev, [role]: next };
    });
    const mod = MODULES.find((m) => m.key === module)?.label ?? module;
    toast(
      nextAllowed
        ? `${mod} liberado pro perfil.`
        : `${mod} escondido do perfil.`
    );
  }

  const groups = [...new Set(MODULES.map((m) => m.group))];

  return (
    <section className="card overflow-hidden p-0">
      <div className="p-4 pb-3">
        <h2 className="text-sm font-semibold">Permissões de acesso</h2>
        <p className="mt-1 text-xs text-[var(--color-muted-2)]">
          Marcado = o perfil vê e usa o módulo. Desmarcado = some do menu e a
          rota é bloqueada. Vale pra todos os usuários do perfil.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-y border-[var(--color-border)] bg-[var(--color-surface-2)]/60 text-left text-xs text-[var(--color-muted)]">
              <th scope="col" className="px-4 py-2.5 font-medium">Módulo</th>
              {ROLES.map((r) => (
                <th key={r.role} scope="col" className="px-3 py-2.5 text-center font-medium">
                  <span className="inline-flex items-center gap-1">
                    {r.label}
                    {r.locked && <Lock className="h-3 w-3" />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g}>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/80">
                  <td
                    colSpan={1 + ROLES.length}
                    className="px-4 py-2 text-[13px] font-semibold"
                  >
                    {g}
                  </td>
                </tr>
                {MODULES.filter((m) => m.group === g).map((m) => (
                  <tr
                    key={m.key}
                    className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]/50"
                  >
                    <th scope="row" className="px-4 py-2.5 text-left font-normal">{m.label}</th>
                    {ROLES.map((r) => {
                      const allowed = r.locked || !denials[r.role]?.has(m.key);
                      const key = `${r.role}:${m.key}`;
                      return (
                        <td key={r.role} className="px-3 py-2.5 text-center">
                          <button
                            onClick={() =>
                              !r.locked && toggle(r.role, m.key)
                            }
                            disabled={r.locked || busy === key}
                            title={
                              r.locked
                                ? "Admin sempre vê tudo"
                                : allowed
                                ? "Clique pra esconder deste perfil"
                                : "Clique pra liberar pra este perfil"
                            }
                            aria-label={`${m.label} — ${r.label}: ${
                              allowed ? "liberado" : "escondido"
                            }`}
                            className={cn(
                              "relative mx-auto block h-5 w-9 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]",
                              allowed
                                ? "bg-[var(--color-primary)]"
                                : "bg-[var(--color-border-strong)]",
                              r.locked
                                ? "cursor-not-allowed opacity-45"
                                : busy === key && "opacity-60"
                            )}
                          >
                            <span
                              className={cn(
                                // thumb do switch: continua claro de propósito (contraste sobre a trilha colorida), só troca a fonte pra acompanhar o tema
                                "absolute top-0.5 h-4 w-4 rounded-full bg-[var(--color-surface)] shadow transition-all",
                                allowed ? "left-[18px]" : "left-0.5"
                              )}
                            />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-3 text-xs text-[var(--color-muted-2)]">
        A mudança vale na próxima navegação de quem for afetado. Ações
        sensíveis (excluir negócio, relatórios, configurações) continuam
        seguindo o perfil e a segurança do banco.
      </p>
    </section>
  );
}
