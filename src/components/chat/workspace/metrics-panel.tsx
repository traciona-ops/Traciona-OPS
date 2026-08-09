"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ymdBR } from "@/lib/utils/dates";
import type { Conv } from "@/components/chat/types";

/** Visão geral das conversas — os filtros da lista não afetam estes números. */
export function MetricsPanel({
  convs,
  accent,
  onBack,
}: {
  convs: Conv[];
  accent: string;
  onBack: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [today, setToday] = useState<{ in: number; out: number } | null>(null);

  useEffect(() => {
    // mensagens de hoje (fuso BR)
    const dayStart = new Date(`${ymdBR()}T00:00:00-03:00`).toISOString();
    Promise.all([
      supabase
        .from("whatsapp_messages")
        .select("id", { count: "exact", head: true })
        .eq("direction", "in")
        .gte("created_at", dayStart),
      supabase
        .from("whatsapp_messages")
        .select("id", { count: "exact", head: true })
        .eq("direction", "out")
        .gte("created_at", dayStart),
    ]).then(([inR, outR]) =>
      setToday({ in: inR.count ?? 0, out: outR.count ?? 0 })
    );
  }, [supabase]);

  const total = convs.length;
  const rows = [
    { label: "Conversas", n: total, color: accent },
    {
      label: "Não lidas",
      n: convs.filter((c) => c.unread > 0).length,
      color: "var(--color-warning)",
    },
    {
      label: "Aguardando atendimento",
      n: convs.filter((c) => !c.owner_id).length,
      color: "var(--color-warning)",
    },
    {
      label: "Em atendimento",
      n: convs.filter((c) => c.owner_id).length,
      color: accent,
    },
    {
      label: "No funil (com card)",
      n: convs.filter((c) => c.in_pipeline).length,
      color: accent,
    },
    {
      label: "Clientes ativos",
      n: convs.filter((c) => c.is_client).length,
      color: "var(--color-success)",
    },
  ];
  const max = Math.max(1, total);

  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto bg-[var(--color-background)] p-6">
      <div className="w-full max-w-md space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4">
            <p className="text-[11px] text-[var(--color-muted)]">Recebidas hoje</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">
              {today ? today.in : "…"}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-[11px] text-[var(--color-muted)]">Enviadas hoje</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">
              {today ? today.out : "…"}
            </p>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold">Funil das conversas</h2>
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.label}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span>{r.label}</span>
                  <span className="font-semibold">
                    {r.n}
                    {total > 0 && r.label !== "Conversas" && (
                      <span className="ml-1 font-normal text-[var(--color-muted-2)]">
                        ({Math.round((r.n / max) * 100)}%)
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[var(--color-surface-2)]">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${(r.n / max) * 100}%`,
                      backgroundColor: r.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-[var(--color-muted-2)]">
            Filtros de setor/responsável não afetam estes números — é a visão geral
            de tudo que você pode ver.
          </p>
        </div>
      </div>
      <button
        onClick={onBack}
        className="mt-4 text-xs font-medium text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
      >
        Voltar pras conversas
      </button>
    </div>
  );
}
