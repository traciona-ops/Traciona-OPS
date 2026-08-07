/**
 * Slug "legível": remove acentos, força lowercase, troca o que não é
 * letra/dígito por '-' e tira hífens das pontas.
 * "Novo Lead" -> "novo-lead", "Reunião Agendada" -> "reuniao-agendada".
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove diacríticos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
