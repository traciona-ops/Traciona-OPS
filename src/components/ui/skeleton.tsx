import { cn } from "@/lib/utils/ui";

/** Bloco pulsante dos esqueletos de carregamento (loading.tsx das rotas). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-[var(--color-surface-2)]",
        className
      )}
    />
  );
}
