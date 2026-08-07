import type { Metadata } from "next";

// A página de login é client component, então o título da aba vem daqui.
export const metadata: Metadata = { title: "Entrar" };

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
