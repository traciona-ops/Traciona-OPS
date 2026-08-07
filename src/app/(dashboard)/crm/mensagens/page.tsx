import { redirect } from "next/navigation";

// A mensageria virou app separado em /chat (sem barra lateral).
// Links antigos (botão "Conversa" nos cards, notificações) caem aqui
// e são levados pra lá preservando a conversa selecionada.

export default async function MensagensPage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string }>;
}) {
  const { lead } = await searchParams;
  redirect(lead ? `/chat?lead=${lead}` : "/chat");
}
