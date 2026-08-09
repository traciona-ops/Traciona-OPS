"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Columns3,
  MessageSquare,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/ui";
import { useRole } from "@/components/context/role-context";
import { can } from "@/lib/permissions";

// Mensagens saiu das abas: a mensageria agora vive no chat flutuante (ChatDock),
// disponível em todas as telas. A página /crm/mensagens segue existindo como
// "inbox completo" (anexos, agendamento, IA), acessada pelo ↗ do popup.
const TABS: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/crm", label: "Pipeline", icon: Columns3, exact: true },
  { href: "/crm/relatorios", label: "Relatórios", icon: BarChart3 },
];

export function CrmHeader() {
  const pathname = usePathname();
  const role = useRole();

  const tabs = TABS.filter(
    (t) => t.href !== "/crm/relatorios" || can.viewReports(role)
  );

  return (
    <header className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between gap-2 px-6 pt-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-[var(--color-primary)]" />
          <div>
            <h1 className="text-base font-semibold leading-tight">CRM</h1>
            <p className="text-xs text-[var(--color-muted)]">
              Pipeline de vendas com chat integrado
            </p>
          </div>
        </div>
      </div>

      <nav className="flex items-center gap-1 px-5 pt-2">
        {tabs.map((t) => {
          const active = t.exact
            ? pathname === t.href
            : pathname.startsWith(t.href);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "relative flex items-center gap-1.5 px-3 py-2.5 text-sm transition-colors",
                active
                  ? "text-[var(--color-foreground)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              {active && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--color-primary)]" />
              )}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
