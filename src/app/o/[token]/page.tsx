import { createAdminClient } from "@/lib/supabase/admin";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export const metadata = { title: "Traciona | Onboarding" };
export const dynamic = "force-dynamic";

// Onboarding — página PÚBLICA (link com token). Uma pergunta por vez,
// com autosave: o cliente pode fechar e voltar de onde parou.
export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data } = await admin
    .from("onboarding_requests")
    .select("id, status, client_name, answers, current_step, assets, lead:leads(name)")
    .eq("token", token)
    .maybeSingle();
  const req = data as unknown as {
    id: string;
    status: string;
    client_name: string;
    answers: Record<string, string> | null;
    current_step: number;
    assets: { name: string; url: string }[] | null;
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
    return (
      <Aviso
        titulo="Onboarding concluído!"
        texto="Recebemos tudo. Nossa equipe já está preparando o seu planejamento — qualquer coisa a gente se fala pelo WhatsApp."
      />
    );
  }

  return (
    <OnboardingWizard
      token={token}
      clientName={req.lead?.name ?? req.client_name ?? "cliente"}
      initialAnswers={req.answers ?? {}}
      initialStep={req.current_step ?? 0}
      initialAssets={req.assets ?? []}
    />
  );
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
