"use client";

import { useEffect, useState } from "react";
import { Monitor, Sun, Moon } from "lucide-react";

type Theme = "system" | "light" | "dark";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "Sistema", icon: Monitor },
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
];

function apply(theme: Theme) {
  const el = document.documentElement;
  if (theme === "system") {
    el.removeAttribute("data-theme");
    localStorage.removeItem("theme");
  } else {
    el.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    setTheme(saved === "light" || saved === "dark" ? saved : "system");
  }, []);

  return (
    <div className="px-3 py-2">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted-2)]">
        Tema
      </p>
      <div className="flex gap-1 rounded-lg bg-[var(--color-surface-2)] p-0.5">
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          const active = theme === o.value;
          return (
            <button
              key={o.value}
              onClick={() => {
                setTheme(o.value);
                apply(o.value);
              }}
              className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-medium transition ${
                active
                  ? "bg-[var(--color-surface)] text-[var(--color-foreground)] shadow-sm"
                  : "text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
              }`}
              title={o.label}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
