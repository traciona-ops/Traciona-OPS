"use client";

import { useEffect, useRef } from "react";
import { Bold, Italic, List, ListOrdered, Underline } from "lucide-react";
import { cn } from "@/lib/utils";

// Editor rich text minimalista (contentEditable + execCommand). O HTML é
// sanitizado no SERVIDOR antes de salvar — aqui é só a edição.

export function RichTextEditor({
  initialHtml,
  onChange,
  placeholder = "Descreve a solicitação...",
  minHeight = 140,
}: {
  initialHtml?: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && initialHtml !== undefined)
      ref.current.innerHTML = initialHtml;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cmd(command: string) {
    ref.current?.focus();
    document.execCommand(command);
    onChange(ref.current?.innerHTML ?? "");
  }

  const tools: { icon: typeof Bold; command: string; label: string }[] = [
    { icon: Bold, command: "bold", label: "Negrito" },
    { icon: Italic, command: "italic", label: "Itálico" },
    { icon: Underline, command: "underline", label: "Sublinhado" },
    { icon: List, command: "insertUnorderedList", label: "Lista" },
    { icon: ListOrdered, command: "insertOrderedList", label: "Lista numerada" },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] transition focus-within:border-[var(--color-primary)]">
      <div className="flex items-center gap-0.5 border-b border-[var(--color-border)] px-2 py-1.5">
        {tools.map((t) => (
          <button
            key={t.command}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              cmd(t.command);
            }}
            title={t.label}
            aria-label={t.label}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
          >
            <t.icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        onInput={() => onChange(ref.current?.innerHTML ?? "")}
        data-placeholder={placeholder}
        className={cn(
          "prose-sm w-full px-3.5 py-3 text-sm leading-relaxed outline-none",
          "[&:empty::before]:pointer-events-none [&:empty::before]:text-[var(--color-muted-2)] [&:empty::before]:content-[attr(data-placeholder)]",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
        )}
        style={{ minHeight }}
      />
    </div>
  );
}

/** Render seguro do HTML já sanitizado no servidor. */
export function RichTextView({ html }: { html: string }) {
  return (
    <div
      className="text-sm leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-1.5"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
