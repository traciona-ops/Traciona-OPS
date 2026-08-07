import { Skeleton } from "@/components/ui/skeleton";

// Esqueleto do board: a troca de tela pinta na hora, os dados preenchem depois.
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] px-4 py-2.5">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-32" />
        <div className="ml-auto flex gap-1.5">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>
      <div className="flex flex-1 gap-0 overflow-hidden px-4 pt-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="w-[86vw] shrink-0 border-r border-t border-[var(--color-border)] first:border-l md:w-[300px]"
          >
            <div className="border-b-2 border-[var(--color-border)] px-3.5 py-2.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-1.5 h-3 w-36" />
            </div>
            <div className="space-y-2.5 bg-[var(--color-surface-2)]/50 p-2.5">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
