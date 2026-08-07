export function Topbar({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6">
      <div>
        <h1 className="text-base font-semibold">{title}</h1>
        {subtitle && (
          <p className="text-xs text-[var(--color-muted)]">{subtitle}</p>
        )}
      </div>
      {action}
    </header>
  );
}
