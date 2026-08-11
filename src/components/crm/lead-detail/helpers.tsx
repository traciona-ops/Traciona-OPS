import { Input } from "@/components/ui/input";

export function InfoRow({
  icon: Icon,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[var(--color-muted)]">
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate text-[var(--color-foreground)]">{value}</span>
    </div>
  );
}

export function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-[var(--color-muted)]">{label}</label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
