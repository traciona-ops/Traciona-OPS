"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  KanbanSquare,
  Plug,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Submenu das Configurações (estilo Groner): grupos sanfona + busca de menus
// + breadcrumb. Novas telas de config entram no MENU e ganham rota própria.

type MenuItem = { href: string; label: string; icon: LucideIcon };
type MenuGroup = { group: string; items: MenuItem[] };

export const SETTINGS_MENU: MenuGroup[] = [
  {
    group: "Geral & Conta",
    items: [{ href: "/settings/conta", label: "Minha conta", icon: UserRound }],
  },
  {
    group: "Equipe",
    items: [
      { href: "/settings/usuarios", label: "Usuários", icon: Users },
      {
        href: "/settings/permissoes",
        label: "Permissões de acesso",
        icon: ShieldCheck,
      },
    ],
  },
  {
    group: "Comercial",
    items: [{ href: "/settings/funis", label: "Funis", icon: KanbanSquare }],
  },
  {
    group: "Sistema",
    items: [
      { href: "/settings/integracoes", label: "Integrações", icon: Plug },
    ],
  },
];

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function SettingsNav() {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  const q = norm(query.trim());
  const groups = q
    ? SETTINGS_MENU.map((g) => ({
        ...g,
        items: g.items.filter(
          (i) => norm(i.label).includes(q) || norm(g.group).includes(q)
        ),
      })).filter((g) => g.items.length)
    : SETTINGS_MENU;

  return (
    <>
      {/* Mobile: trilho horizontal de atalhos */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 md:hidden">
        {SETTINGS_MENU.flatMap((g) => g.items).map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-[var(--color-primary)] text-[var(--color-on-accent)]"
                  : "bg-[var(--color-surface-2)] text-[var(--color-muted)]"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Desktop: submenu lateral com busca e grupos sanfona */}
      <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-surface)] p-3 md:flex">
        <label className="mb-3 flex h-10 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--color-muted-2)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar menus"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-muted-2)]"
          />
        </label>

        <nav className="flex flex-col gap-0.5">
          {groups.map((g) => {
            const open = q ? true : !closed[g.group];
            return (
              <div key={g.group} className="flex flex-col gap-0.5">
                <button
                  onClick={() =>
                    setClosed((prev) => ({ ...prev, [g.group]: !prev[g.group] }))
                  }
                  aria-expanded={open}
                  className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-[13px] font-semibold text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-2)]"
                >
                  <span className="min-w-0 flex-1 truncate text-left">
                    {g.group}
                  </span>
                  {open ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-[var(--color-muted-2)]" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-muted-2)]" />
                  )}
                </button>
                {open &&
                  g.items.map((item) => {
                    const active = pathname.startsWith(item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "ml-2 flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors",
                          active
                            ? "bg-[var(--color-primary)] font-medium text-[var(--color-on-accent)] shadow-sm"
                            : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">
                          {item.label}
                        </span>
                      </Link>
                    );
                  })}
              </div>
            );
          })}
          {q && !groups.length && (
            <p className="px-2 py-3 text-xs text-[var(--color-muted-2)]">
              Nenhum menu encontrado.
            </p>
          )}
        </nav>
      </aside>
    </>
  );
}

export function SettingsBreadcrumb() {
  const pathname = usePathname();
  const group = SETTINGS_MENU.find((g) =>
    g.items.some((i) => pathname.startsWith(i.href))
  );
  const item = group?.items.find((i) => pathname.startsWith(i.href));
  if (!group || !item) return null;
  return (
    <nav className="mb-4 flex items-center gap-1.5 text-[13px]">
      <Link
        href="/settings"
        className="text-[var(--color-muted)] underline-offset-2 hover:underline"
      >
        Configurações
      </Link>
      <ChevronRight className="h-3.5 w-3.5 text-[var(--color-muted-2)]" />
      <span className="text-[var(--color-muted)]">{group.group}</span>
      <ChevronRight className="h-3.5 w-3.5 text-[var(--color-muted-2)]" />
      <span className="font-medium text-[var(--color-foreground)]">
        {item.label}
      </span>
    </nav>
  );
}
