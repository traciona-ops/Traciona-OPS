// Sanitizador de HTML do editor rich text (briefings). Allowlist curta de
// formatação; QUALQUER atributo é removido (mata onclick, href js:, style).

const ALLOWED = ["b", "strong", "i", "em", "u", "s", "p", "br", "ul", "ol", "li", "div"];

export function sanitizeHtml(input: string): string {
  let s = (input ?? "").slice(0, 30000);
  s = s.replace(/<(script|style|iframe|object|embed|svg|math)[\s\S]*?(<\/\1>|$)/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<([a-zA-Z0-9]+)(?:\s[^>]*)?\/?>/g, (_m, tag: string) => {
    const t = tag.toLowerCase();
    if (t === "br") return "<br>";
    return ALLOWED.includes(t) ? `<${t}>` : "";
  });
  s = s.replace(/<\/([a-zA-Z0-9]+)\s*>/g, (_m, tag: string) => {
    const t = tag.toLowerCase();
    return ALLOWED.includes(t) && t !== "br" ? `</${t}>` : "";
  });
  return s;
}

/** HTML → texto puro (pra prévias e buscas). */
export function htmlToText(html: string): string {
  return (html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}
