"use client";

import dynamic from "next/dynamic";

// O OPS Chat é o maior componente do app e ficava no bundle inicial de TODAS
// as páginas. Aqui ele vira um chunk separado, baixado depois da primeira
// pintura — a tela abre mais rápido e o botão do chat aparece logo em seguida.
export const ChatDockLazy = dynamic(
  () => import("@/components/chat/chat-dock").then((m) => m.ChatDock),
  { ssr: false }
);
