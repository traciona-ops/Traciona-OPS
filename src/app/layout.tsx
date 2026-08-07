import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

export const metadata: Metadata = {
  // Cada tela define seu título ("Negócios", "Tarefas"...) e a aba vira
  // "Traciona | Negócios"; sem título definido, cai no default.
  title: {
    default: "Traciona — Eco Sistema",
    template: "Traciona | %s",
  },
  description: "A operação que você consegue enxergar.",
};

// Aplica o tema salvo antes da 1ª pintura (evita flash claro→escuro).
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* aperto de mão TLS com o Supabase antes da 1ª consulta do browser */}
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <link
            rel="preconnect"
            href={process.env.NEXT_PUBLIC_SUPABASE_URL}
            crossOrigin="anonymous"
          />
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
