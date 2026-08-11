export const dt = (s: string | null) =>
  s ? s.slice(0, 10).split("-").reverse().join("/") : "—";
