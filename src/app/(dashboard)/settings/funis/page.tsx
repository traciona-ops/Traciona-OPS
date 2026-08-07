import { createClient } from "@/lib/supabase/server";
import type { Pipeline } from "@/lib/types";

export const metadata = { title: "Funis" };

export default async function FunisPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pipelines")
    .select("*")
    .order("position");
  const pipelines = (data ?? []) as Pipeline[];

  return (
    <section className="card p-5">
      <h2 className="mb-4 text-sm font-semibold">
        Funis ({pipelines.length})
      </h2>
      <div className="space-y-2">
        {pipelines.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-2.5 rounded-lg bg-[var(--color-surface-2)] px-3 py-2"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            <span className="flex-1 text-sm">{p.name}</span>
            <span
              className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-muted)]"
              title="Identificador (code) — usado em URLs/integrações"
            >
              {p.code}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-[var(--color-muted-2)]">
        Criação e edição de funis e etapas é no CRM: seletor do funil → menu ⋯
        → Editar, ou o botão Configurar no board.
      </p>
    </section>
  );
}
