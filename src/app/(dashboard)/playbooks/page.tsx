import { BookOpen } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/access";
import type { Playbook, PlaybookType } from "@/lib/types";

const TYPE_LABEL: Record<PlaybookType, string> = {
  sales: "Vendas",
  objection: "Objeções",
  product: "Produto",
};

export const metadata = { title: "Playbooks" };

export default async function PlaybooksPage() {
  await requireModule("playbooks");
  const supabase = await createClient();
  const { data } = await supabase
    .from("playbooks")
    .select("*")
    .order("position");
  const playbooks = (data ?? []) as Playbook[];

  const grouped: Record<PlaybookType, Playbook[]> = {
    sales: [],
    objection: [],
    product: [],
  };
  // type é texto livre no banco — valor fora do esperado não pode dar 500
  for (const p of playbooks) (grouped[p.type] ?? grouped.sales).push(p);

  return (
    <>
      <Topbar
        title="Playbooks"
        subtitle="Scripts de venda, objeções e produto"
      />
      <div className="flex-1 overflow-y-auto p-6">
        {playbooks.length === 0 ? (
          <div className="card flex flex-col items-center p-10 text-center">
            <BookOpen className="mb-3 h-8 w-8 text-[var(--color-muted-2)]" />
            <h2 className="mb-1 text-base font-semibold">
              Nenhum playbook ainda
            </h2>
            <p className="max-w-sm text-sm text-[var(--color-muted)]">
              Cadastre scripts de vendas, contorno de objeções e detalhes de
              produto para a equipe consultar durante o atendimento. CRUD de
              playbooks entra no Sprint 4.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {(Object.keys(grouped) as PlaybookType[]).map((type) =>
              grouped[type].length ? (
                <section key={type}>
                  <h2 className="mb-2 text-sm font-semibold text-[var(--color-muted)]">
                    {TYPE_LABEL[type]}
                  </h2>
                  <div className="grid gap-3 md:grid-cols-2">
                    {grouped[type].map((p) => (
                      <div key={p.id} className="card p-4">
                        <h3 className="mb-1 text-sm font-medium">{p.title}</h3>
                        <p className="line-clamp-4 whitespace-pre-wrap text-xs text-[var(--color-muted)]">
                          {p.content}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null
            )}
          </div>
        )}
      </div>
    </>
  );
}
