import { currencyBRL } from "@/lib/utils/ui";
import type { MonthBar } from "./types";

/** Barras mensais no estilo do Dashboard (grade + rótulo em cima). */
export function MonthlyBars({ data }: { data: MonthBar[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const fmt = (v: number) =>
    v >= 1000
      ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(".", ",")}k`
      : String(Math.round(v));
  return (
    <div>
      <div className="relative" style={{ height: 110 }}>
        {[0, 25, 50, 75].map((p) => (
          <div
            key={p}
            className="absolute inset-x-0 border-t border-[var(--color-border)]/70"
            style={{ top: `${p}%` }}
          />
        ))}
        <div className="absolute inset-x-0 bottom-0 border-t border-[var(--color-border)]" />
        <div className="relative flex h-full items-end gap-[5%] px-1">
          {data.map((d, i) => (
            <div
              key={i}
              className="flex h-full flex-1 flex-col items-center justify-end"
              title={`${d.label}: ${currencyBRL(d.value)}`}
            >
              {d.value > 0 && (
                <span className="mb-1 text-[11px] font-bold tabular-nums text-[var(--color-muted)]">
                  {fmt(d.value)}
                </span>
              )}
              <div
                className="w-full max-w-12 rounded-t-md"
                style={{
                  height: `${Math.max(d.value > 0 ? 4 : 0, (d.value / max) * 78)}%`,
                  backgroundColor: d.highlight
                    ? "var(--color-primary)"
                    : "color-mix(in srgb, var(--color-primary) 45%, transparent)",
                }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex gap-[5%] px-1">
        {data.map((d, i) => (
          <span
            key={i}
            className="flex-1 text-center text-[11px] capitalize text-[var(--color-muted-2)]"
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
