/** Classes repetidas nas seções do painel do lead. */
export const SECTION_LABEL =
  "mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted-2)]";

/** Mesma coisa, mas pra rótulo com ícone ao lado. */
export const SECTION_LABEL_ICON =
  "mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted-2)]";

export const SELECT =
  "h-9 w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 text-sm";

/** Executa uma mutação e atualiza a tela (cada seção recebe já pronto). */
export type RunMutation = (fn: () => Promise<unknown>) => Promise<void>;
