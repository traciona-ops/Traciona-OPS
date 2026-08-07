"use client";

import { useMemo, useRef, useState } from "react";
import { currencyBRL } from "@/lib/utils";

// Gráfico de área/linha interativo (SVG puro, sem lib): seletor de métrica
// e tooltip seguindo o mouse — o "gráfico de verdade" do dashboard.

export type TrendPoint = {
  label: string; // "dd/mm"
  leads: number;
  msgs: number;
  revenue: number;
};

type MetricKey = "leads" | "msgs" | "revenue";

const METRICS: {
  key: MetricKey;
  label: string;
  color: string;
  fmt: (v: number) => string;
}[] = [
  { key: "leads", label: "Novos leads", color: "#1d6fff", fmt: (v) => String(v) },
  { key: "msgs", label: "Mensagens", color: "#0b7c8a", fmt: (v) => String(v) },
  {
    key: "revenue",
    label: "Receita ganha",
    color: "#0ca678",
    fmt: (v) => currencyBRL(v),
  },
];

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const [metric, setMetric] = useState<MetricKey>("leads");
  const [hover, setHover] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const m = METRICS.find((x) => x.key === metric)!;
  const values = data.map((d) => d[metric]);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);

  // pontos em espaço 0–100 (x) / 0–100 (y, invertido, com folga no topo)
  const pts = useMemo(
    () =>
      values.map((v, i) => ({
        x: values.length > 1 ? (i / (values.length - 1)) * 100 : 50,
        y: 96 - (v / max) * 84,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [metric, data]
  );
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
  const area = `${line} L100,100 L0,100 Z`;

  function onMove(e: React.MouseEvent) {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || values.length === 0) return;
    const frac = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    setHover(Math.round(frac * (values.length - 1)));
  }

  // ~6 rótulos no eixo X pra não amontoar
  const step = Math.max(1, Math.ceil(data.length / 6));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span
            className="text-2xl font-bold tabular-nums tracking-tight"
            style={{ color: m.color }}
          >
            {m.fmt(total)}
          </span>
          <span className="text-xs text-[var(--color-muted-2)]">
            no período
          </span>
        </div>
        <div className="flex rounded-xl bg-[var(--color-surface-2)] p-0.5 text-xs font-medium">
          {METRICS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => {
                setMetric(opt.key);
                setHover(null);
              }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                metric === opt.key
                  ? "bg-[var(--color-surface)] font-semibold text-[var(--color-foreground)] shadow-sm"
                  : "text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: opt.color }}
              />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={boxRef}
        className="relative h-48 select-none"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* linhas de grade */}
        {[4, 25, 50, 75].map((p) => (
          <div
            key={p}
            className="absolute inset-x-0 border-t border-[var(--color-border)]/70"
            style={{ top: `${p}%` }}
          />
        ))}
        <div className="absolute inset-x-0 bottom-0 border-t border-[var(--color-border)]" />

        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          <defs>
            <linearGradient id={`fill-${metric}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={m.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={m.color} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#fill-${metric})`} />
          <path
            d={line}
            fill="none"
            stroke={m.color}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>

        {/* ponto + tooltip do hover */}
        {hover != null && pts[hover] && (
          <>
            <div
              className="pointer-events-none absolute inset-y-0 border-l border-dashed border-[var(--color-border-strong)]"
              style={{ left: `${pts[hover].x}%` }}
            />
            <div
              className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
              style={{
                left: `${pts[hover].x}%`,
                top: `${pts[hover].y}%`,
                backgroundColor: m.color,
              }}
            />
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg bg-[var(--color-foreground)] px-2.5 py-1.5 text-center shadow-lg"
              style={{
                left: `${Math.min(88, Math.max(12, pts[hover].x))}%`,
                top: `${Math.max(0, pts[hover].y - 22)}%`,
              }}
            >
              <p className="text-[11px] text-[var(--color-background)]/70">
                {data[hover].label}
              </p>
              <p className="text-xs font-bold tabular-nums text-[var(--color-background)]">
                {m.fmt(values[hover])}
              </p>
            </div>
          </>
        )}
      </div>

      {/* eixo X */}
      <div className="relative mt-1.5 h-4">
        {data.map((d, i) =>
          i % step === 0 ? (
            <span
              key={i}
              className="absolute -translate-x-1/2 text-[11px] tabular-nums text-[var(--color-muted-2)]"
              style={{
                left: `${data.length > 1 ? (i / (data.length - 1)) * 100 : 50}%`,
              }}
            >
              {d.label}
            </span>
          ) : null
        )}
      </div>
    </div>
  );
}
