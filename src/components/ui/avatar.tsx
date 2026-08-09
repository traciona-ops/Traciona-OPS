"use client";

import { useState } from "react";
import { cn, initials, readableInk } from "@/lib/utils/ui";

// Cores fixas de identidade (não seguem o tema): a mesma pessoa tem sempre a
// mesma cor nos dois temas. O azul é o próprio primary do claro, que já passa
// 4.5:1 com tinta branca — o #1d6fff antigo ficava em 4.40.
const COLORS = [
  "#055fff",
  "#00d4ff",
  "#00e5a0",
  "#fbbf24",
  "#ff5c5c",
  "#f472b6",
  "#8b9bb4",
];

function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}

export function Avatar({
  name,
  size = 32,
  className,
  src,
  alt,
}: {
  name: string;
  size?: number;
  className?: string;
  src?: string | null;
  /** Override de acessibilidade: "" quando o nome já aparece ao lado (avatar vira decorativo). Padrão usa o nome, pois em vários lugares o avatar é a única identificação. */
  alt?: string;
}) {
  // Foto do WhatsApp expira com o tempo — quando quebrar, cai nas iniciais.
  const [broken, setBroken] = useState(false);
  const bg = colorFor(name || "?");
  const resolvedAlt = alt ?? name;
  const decorative = resolvedAlt === "";
  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={resolvedAlt}
        aria-hidden={decorative || undefined}
        title={name}
        loading="lazy"
        width={size}
        height={size}
        onError={() => setBroken(true)}
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full font-semibold shrink-0",
        className
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: bg,
        color: readableInk(bg),
        fontSize: size * 0.4,
      }}
      title={name}
      aria-hidden={decorative || undefined}
    >
      {initials(name || "?")}
    </div>
  );
}
