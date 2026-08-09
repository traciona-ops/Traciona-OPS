"use client";

import { useEffect, useState } from "react";

/** Cor do chat: preferência do usuário, salva neste navegador. */
const ACCENT_KEY = "traciona:chat:accent";

export const CHAT_ACCENTS = [
  { name: "Azul", color: "#1d6fff" },
  { name: "Verde WhatsApp", color: "#25d366" },
  { name: "Roxo", color: "#a78bfa" },
  { name: "Rosa", color: "#f472b6" },
  { name: "Laranja", color: "#f59e0b" },
  { name: "Grafite", color: "#334155" },
];

/**
 * Lê/escreve a cor no localStorage e sincroniza as instâncias abertas (dock e
 * página) por um CustomEvent — trocar a cor nas preferências reflete no botão
 * flutuante na hora.
 */
export function useChatAccent(): [string, (c: string) => void] {
  const [accent, setAccentState] = useState("#1d6fff");
  useEffect(() => {
    const saved = localStorage.getItem(ACCENT_KEY);
    if (saved) setAccentState(saved);
    const onChange = (e: Event) =>
      setAccentState((e as CustomEvent<string>).detail);
    window.addEventListener("chat-accent", onChange);
    return () => window.removeEventListener("chat-accent", onChange);
  }, []);
  const setAccent = (c: string) => {
    localStorage.setItem(ACCENT_KEY, c);
    window.dispatchEvent(new CustomEvent("chat-accent", { detail: c }));
  };
  return [accent, setAccent];
}
