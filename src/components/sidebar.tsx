"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  UserRound,
  ChevronDown,
  ClipboardCheck,
  FileSignature,
  Package,
  ShoppingCart,
  House,
  Handshake,
  CalendarDays,
  CalendarClock,
  LayoutGrid,
  NotebookPen,
  Settings,
  Sparkles,
  SquareCheckBig,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { LeadSearch } from "@/components/crm/lead-search";
import { ROLE_LABEL, can } from "@/lib/permissions";
import type { UserRole } from "@/lib/types";

// Sidebar estilo Groner: itens soltos no topo, setores em seções sanfona
// (chevron abre/fecha, salvo no navegador) e rodapé com usuário + sair.
// Fechada vira trilho de ícones.

const EXPAND_KEY = "traciona:sidebar:expanded";
const SECTIONS_KEY = "traciona:sidebar:closed";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
};

type NavSection = {
  title: string;
  icon: LucideIcon;
  items: NavItem[];
};

export function Sidebar({
  userName,
  userAvatar,
  role,
  crmCount = 0,
  contractsPending = 0,
  tasksLate = 0,
  denied = [],
}: {
  userName: string;
  userAvatar?: string | null;
  role: UserRole;
  crmCount?: number;
  contractsPending?: number;
  tasksLate?: number;
  /** Módulos escondidos deste perfil (Permissões de acesso). */
  denied?: string[];
}) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  // Recolhida + mouse em cima = abre temporariamente; sai, volta ao trilho.
  const isOpen = expanded || hovered;

  useEffect(() => {
    const saved = localStorage.getItem(EXPAND_KEY);
    if (saved !== null) setExpanded(saved === "1");
    try {
      const sec = localStorage.getItem(SECTIONS_KEY);
      if (sec) setClosed(JSON.parse(sec));
    } catch {
      /* estado limpo */
    }
  }, []);

  function toggle() {
    setExpanded((e) => {
      localStorage.setItem(EXPAND_KEY, e ? "0" : "1");
      return !e;
    });
  }

  function toggleSection(title: string) {
    setClosed((prev) => {
      const next = { ...prev, [title]: !prev[title] };
      localStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
      return next;
    });
  }

  // Permissões de acesso: módulo negado some do menu (href → módulo)
  const ok = (href: string) => {
    const mod = href === "/" ? "" : href.slice(1);
    return !mod || !denied.includes(mod);
  };

  // Itens de uso geral, sempre visíveis (estilo Groner: soltos no topo)
  const topItems: NavItem[] = [
    { href: "/", label: "Início", icon: House },
    { href: "/dashboards", label: "Dashboards", icon: LayoutGrid },
    { href: "/agenda", label: "Agenda", icon: CalendarDays },
    { href: "/disponibilidade", label: "Disponibilidade", icon: CalendarClock },
  ].filter((i) => ok(i.href));

  // Ecossistema organizado por SETORES (decisão 08/2026). Cada setor é uma
  // seção sanfona; novos setores entram aqui conforme forem lançados.
  const sections: NavSection[] = [
    {
      title: "Comercial",
      icon: Briefcase,
      items: [
        { href: "/contatos", label: "Contatos", icon: UserRound },
        { href: "/crm", label: "Negócios", icon: Handshake, badge: crmCount },
        {
          href: "/atividades",
          label: "Tarefas Comerciais",
          icon: SquareCheckBig,
          badge: tasksLate,
        },
        {
          href: "/contratos",
          label: "Contratos",
          icon: FileSignature,
          badge: contractsPending,
        },
        { href: "/vendas", label: "Vendas", icon: ShoppingCart },
      ].filter((i) => ok(i.href)),
    },
    {
      title: "Operações & Projetos",
      icon: Package,
      items: [
        { href: "/onboarding", label: "Onboarding", icon: ClipboardCheck },
        { href: "/briefings", label: "Briefings", icon: NotebookPen },
        { href: "/prompts", label: "Prompts & IA", icon: Sparkles },
      ].filter((i) => ok(i.href)),
    },
  ].filter((s) => s.items.length);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // Navegou pra dentro de um setor fechado (ex.: via Ctrl+K)? Abre ele.
  useEffect(() => {
    const sec = sections.find((s) => s.items.some((i) => isActive(i.href)));
    if (sec) {
      setClosed((prev) => (prev[sec.title] ? { ...prev, [sec.title]: false } : prev));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Bottom bar mobile: 5 mais usados (Disponibilidade fica só no desktop)
  const nav: NavItem[] = [
    { href: "/crm", label: "Negócios", icon: Handshake, badge: crmCount },
    { href: "/contatos", label: "Contatos", icon: UserRound },
    { href: "/atividades", label: "Tarefas", icon: SquareCheckBig, badge: tasksLate },
    { href: "/dashboards", label: "Dashboards", icon: LayoutGrid },
    { href: "/agenda", label: "Agenda", icon: CalendarDays },
  ].filter((i) => ok(i.href));

  return (
    <>
      {/* ---------- MOBILE: topbar enxuta (menu vive na bottom bar) ---------- */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 md:hidden">
        <Link href="/" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/symbol.svg" alt="Traciona" className="h-8 w-8" />
          <span className="text-sm font-semibold tracking-tight">Traciona</span>
        </Link>
        <div className="ml-auto flex items-center gap-1.5">
          <LeadSearch />
          <AvatarMenu
            userName={userName}
            userAvatar={userAvatar}
            roleLabel={ROLE_LABEL[role]}
            isAdmin={can.manageTeam(role)}
            expanded={false}
            below
          />
        </div>
      </header>

      {/* ---------- MOBILE: bottom bar estilo app (Groner) ---------- */}
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-[70] flex border-t border-[var(--color-border)] bg-[var(--color-surface)] pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {nav.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                active
                  ? "text-[var(--color-primary)]"
                  : "text-[var(--color-muted-2)]"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
              {item.badge ? (
                <span className="absolute right-[22%] top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[11px] font-bold text-[var(--color-danger-foreground)]">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* ---------- DESKTOP: sidebar ---------- */}
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "hidden h-full shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] py-4 transition-[width] duration-200 md:flex",
          isOpen ? "w-56 px-3" : "w-[68px] items-center px-0"
        )}
      >
        {/* Logo + abrir/fechar */}
        <div
          className={cn(
            "mb-4 flex items-center",
            isOpen ? "justify-between px-1" : "flex-col gap-2"
          )}
        >
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/symbol.svg" alt="Traciona" className="h-8 w-8" />
            {isOpen && (
              <span className="text-sm font-semibold tracking-tight">
                Traciona
              </span>
            )}
          </Link>
          <button
            onClick={toggle}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted-2)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
            title={expanded ? "Recolher menu" : "Fixar menu aberto"}
            aria-label={expanded ? "Recolher menu" : "Fixar menu aberto"}
          >
            {expanded ? (
              <PanelLeftClose className="h-4.5 w-4.5" />
            ) : (
              <PanelLeftOpen className="h-4.5 w-4.5" />
            )}
          </button>
        </div>

        {/* Busca global (Ctrl+K funciona em todas as telas) */}
        <div
          className={
            isOpen
              ? "mb-3 [&>button]:w-full [&>button]:justify-start"
              : "[&>button]:hidden"
          }
        >
          <LeadSearch />
        </div>

        {/* Navegação: itens gerais + setores sanfona */}
        <nav
          aria-label="Navegação principal"
          className={cn(
            "flex flex-1 flex-col gap-1 overflow-y-auto",
            !isOpen && "items-center gap-1.5"
          )}
        >
          {topItems.map((item) => (
            <NavButton
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isActive(item.href)}
              badge={item.badge}
              expanded={isOpen}
            />
          ))}

          {sections.map((sec) => {
            const open = !closed[sec.title];
            const SecIcon = sec.icon;
            const totalBadge = sec.items.reduce((s, i) => s + (i.badge ?? 0), 0);
            if (!isOpen) {
              // Trilho de ícones: divisor + itens do setor, sem cabeçalho
              return (
                <div key={sec.title} className="flex flex-col items-center gap-1.5">
                  <div className="my-1 h-px w-8 bg-[var(--color-border)]" />
                  {sec.items.map((item) => (
                    <NavButton
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      active={isActive(item.href)}
                      badge={item.badge}
                      expanded={false}
                    />
                  ))}
                </div>
              );
            }
            return (
              <div key={sec.title} className="mt-2 flex flex-col gap-0.5">
                <button
                  onClick={() => toggleSection(sec.title)}
                  aria-expanded={open}
                  className="flex h-9 w-full items-center gap-2.5 rounded-xl px-3 text-[13px] font-semibold text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-2)]"
                >
                  <SecIcon className="h-4.5 w-4.5 shrink-0 text-[var(--color-muted)]" />
                  <span className="min-w-0 flex-1 truncate text-left">
                    {sec.title}
                  </span>
                  {!open && totalBadge ? (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)] px-1.5 text-[11px] font-semibold text-[var(--color-muted)]">
                      {totalBadge > 99 ? "99+" : totalBadge}
                    </span>
                  ) : null}
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-[var(--color-muted-2)] transition-transform",
                      open && "rotate-180"
                    )}
                  />
                </button>
                {open && (
                  <div className="ml-[21px] flex flex-col gap-0.5 border-l border-[var(--color-border)] pl-2">
                    {sec.items.map((item) => (
                      <NavButton
                        key={item.href}
                        href={item.href}
                        label={item.label}
                        icon={item.icon}
                        active={isActive(item.href)}
                        badge={item.badge}
                        expanded
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Rodapé: Configurações + usuário/sair (estilo Groner) */}
        <div
          className={cn("mt-2 flex flex-col gap-1.5", !isOpen && "items-center")}
        >
          <div
            className={cn(
              "my-1 h-px bg-[var(--color-border)]",
              isOpen ? "mx-1" : "w-8"
            )}
          />
          {can.manageTeam(role) && (
            <NavButton
              href="/settings"
              label="Configurações"
              icon={Settings}
              active={pathname.startsWith("/settings")}
              expanded={isOpen}
            />
          )}
          {isOpen ? (
            <div className="flex items-center gap-1">
              <AvatarMenu
                userName={userName}
                userAvatar={userAvatar}
                roleLabel={ROLE_LABEL[role]}
                isAdmin={can.manageTeam(role)}
                expanded
              />
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  title="Sair"
                  aria-label="Sair"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--color-muted-2)] transition hover:bg-[var(--color-danger)]/8 hover:text-[var(--color-danger)]"
                >
                  <LogOut className="h-4.5 w-4.5" />
                </button>
              </form>
            </div>
          ) : (
            <AvatarMenu
              userName={userName}
              userAvatar={userAvatar}
              roleLabel={ROLE_LABEL[role]}
              isAdmin={can.manageTeam(role)}
              expanded={false}
            />
          )}
        </div>
      </aside>
    </>
  );
}

function NavButton({
  href,
  label,
  icon: Icon,
  active = false,
  disabled = false,
  badge,
  expanded,
  onClick,
}: {
  href?: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
  disabled?: boolean;
  badge?: number;
  expanded: boolean;
  onClick?: () => void;
}) {
  // Anel de foco em todo item: navegar o menu por Tab precisa mostrar onde
  // o foco está, senão o teclado anda às cegas.
  const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]";

  const base = expanded
    ? cn(
        "group relative flex h-9 w-full items-center gap-2.5 rounded-xl px-3 text-[13px] transition-colors",
        focusRing,
        active
          ? "bg-[var(--color-primary)] font-medium text-[var(--color-primary-foreground)] shadow-sm"
          : disabled
          ? "cursor-not-allowed text-[var(--color-muted)] opacity-70"
          : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
      )
    : cn(
        "group relative flex h-10 w-10 items-center justify-center rounded-2xl transition-colors",
        focusRing,
        active
          ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-sm"
          : disabled
          ? "cursor-not-allowed text-[var(--color-muted)] opacity-70"
          : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
      );

  const inner = expanded ? (
    <>
      <Icon className="h-4.5 w-4.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge ? (
        <span
          className={cn(
            "flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
            active
              ? "bg-[var(--color-primary-foreground)]/25 text-[var(--color-primary-foreground)]"
              : "bg-[var(--color-surface-2)] text-[var(--color-muted)]"
          )}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </>
  ) : (
    <>
      <Icon className="h-4.5 w-4.5" />
      {badge ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[11px] font-semibold text-[var(--color-on-accent)]">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
      <Tooltip label={label} />
    </>
  );

  if (disabled || !href) {
    return <div className={base}>{inner}</div>;
  }
  return (
    <Link href={href} className={base} onClick={onClick}>
      {inner}
    </Link>
  );
}

function AvatarMenu({
  userName,
  userAvatar,
  roleLabel,
  isAdmin,
  expanded,
  below = false,
}: {
  userName: string;
  userAvatar?: string | null;
  roleLabel?: string;
  isAdmin: boolean;
  expanded: boolean;
  /** true = topbar mobile: o menu abre PRA BAIXO, alinhado à direita. */
  below?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={below ? "relative" : "relative min-w-0 flex-1"}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          expanded
            ? "flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-[var(--color-surface-2)]"
            : "mx-auto flex items-center justify-center rounded-full ring-2 ring-transparent transition hover:ring-[var(--color-border-strong)]"
        )}
        aria-label="Menu do usuário"
      >
        <Avatar name={userName} src={userAvatar} size={expanded ? 32 : 36} />
        {expanded && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {userName}
              </span>
              <span className="block truncate text-[11px] text-[var(--color-muted-2)]">
                {roleLabel ?? "Minha conta"}
              </span>
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-[var(--color-muted-2)] transition-transform",
                open && "rotate-180"
              )}
            />
          </>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={cn(
              "z-50 w-52 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg",
              below
                ? "absolute right-0 top-[115%]"
                : expanded
                ? "absolute bottom-[110%] left-0"
                : "absolute bottom-0 left-[120%]"
            )}
          >
            <div className="border-b border-[var(--color-border)] px-3 py-2.5">
              <p className="truncate text-sm font-medium">{userName}</p>
              <p className="text-xs text-[var(--color-muted)]">
                {roleLabel ?? "Minha conta"}
              </p>
            </div>
            {isAdmin && (
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--color-foreground)] hover:bg-[var(--color-surface-2)]"
              >
                <Settings className="h-4 w-4 text-[var(--color-muted)]" />
                Configurações
              </Link>
            )}
            <div className="my-1 h-px bg-[var(--color-border)]" />
            <ThemeToggle />
            <div className="my-1 h-px bg-[var(--color-border)]" />
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger)]/8"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

function Tooltip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-[120%] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-lg bg-[var(--color-foreground)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-background)] opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
      {label}
    </span>
  );
}
