import { createAdminClient } from "@/lib/supabase/admin";
import { OpsFormWizard } from "@/components/ops-form/ops-form-wizard";

export const metadata = { title: "Traciona | Seus dados" };
export const dynamic = "force-dynamic";

// OPS Form — página PÚBLICA (link com token enviado pelo WhatsApp).
// Busca com service role: a tabela não é exposta pro navegador.
export default async function OpsFormPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data } = await admin
    .from("form_requests")
    .select("id, status, lead:leads(name)")
    .eq("token", token)
    .maybeSingle();
  const req = data as unknown as {
    id: string;
    status: string;
    lead: { name: string } | null;
  } | null;

  if (!req || req.status === "cancelado") {
    return (
      <Aviso
        titulo="Link indisponível"
        texto="Esse link não existe mais ou foi cancelado. Fala com a gente pelo WhatsApp que enviamos um novo."
      />
    );
  }
  if (req.status === "respondido") {
    // também é a tela que o cliente vê logo após confirmar (a action
    // revalida a rota e o servidor re-renderiza já como respondido)
    return (
      <Aviso
        titulo="Tudo certo!"
        texto="Recebemos os seus dados e o seu contrato já está sendo preparado. Em breve você recebe o link de assinatura no seu WhatsApp."
      />
    );
  }

  return <OpsFormWizard token={token} leadName={req.lead?.name ?? "cliente"} />;
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--color-background)] px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/symbol.svg" alt="Traciona" className="h-10 w-10" />
      <h1 className="text-xl font-semibold">{titulo}</h1>
      <p className="max-w-sm text-[15px] leading-relaxed text-[var(--color-muted)]">
        {texto}
      </p>
    </div>
  );
}
