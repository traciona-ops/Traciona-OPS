export default function Loading() {
  return (
    <div className="flex-1 overflow-hidden p-6">
      <div className="mx-auto max-w-5xl animate-pulse space-y-4">
        <div className="h-7 w-48 rounded-lg bg-[var(--color-surface-2)]" />
        <div className="h-4 w-72 rounded bg-[var(--color-surface-2)]" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-[var(--color-surface-2)]" />
          ))}
        </div>
        <div className="h-72 rounded-xl bg-[var(--color-surface-2)]" />
      </div>
    </div>
  );
}
