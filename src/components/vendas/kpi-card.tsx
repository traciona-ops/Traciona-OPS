import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/ui";

export function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "neutral",
  extra,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "danger" | "primary" | "neutral";
  extra?: React.ReactNode;
}) {
  const cls =
    tone === "danger"
      ? "text-[var(--color-danger)]"
      : tone === "ok"
      ? "text-[var(--color-success)]"
      : tone === "primary"
      ? "text-[var(--color-primary)]"
      : "text-[var(--color-foreground)]";
  return (
    <div className="card flex flex-col gap-1.5 rounded-2xl p-3.5">
      <span className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--color-muted)]">
          {label}
        </span>
        <Icon className="h-4 w-4 text-[var(--color-muted-2)]" />
      </span>
      <span
        className={cn(
          "truncate text-xl font-semibold tabular-nums leading-none",
          cls
        )}
      >
        {value}
      </span>
      {sub && (
        <span className="text-[11px] text-[var(--color-muted-2)]">{sub}</span>
      )}
      {extra}
    </div>
  );
}
