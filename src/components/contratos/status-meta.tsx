import {
  FilePen,
  FileCheck2,
  FileX2,
  Archive,
  Clock,
  ClipboardList,
  PenLine,
  Upload,
  type LucideIcon,
} from "lucide-react";
import type { ContractRow, Mode } from "./types";

// Cores semânticas (VibeUX): verde = concluído, âmbar = atenção, vermelho =
// negativo, cinza = neutro. Azul da marca fica pros CTAs, não pra status.
// `tone` alimenta o <Badge>; `iconBox` é o selo redondo sobre o avatar (não
// tem o formato de pílula do Badge, por isso continua com classes próprias).
export const STATUS_META: Record<
  ContractRow["status"],
  {
    label: string;
    icon: LucideIcon;
    tone: "neutral" | "warning" | "success" | "danger";
    iconBox: string;
  }
> = {
  rascunho: {
    label: "Rascunho",
    icon: FilePen,
    tone: "neutral",
    iconBox: "bg-[var(--color-surface-2)] text-[var(--color-muted)]",
  },
  enviado: {
    label: "Aguardando assinatura",
    icon: Clock,
    tone: "warning",
    iconBox:
      "bg-[color-mix(in_srgb,var(--color-warning)_12%,var(--color-surface))] text-[var(--color-warning)]",
  },
  assinado: {
    label: "Assinado",
    icon: FileCheck2,
    tone: "success",
    iconBox:
      "bg-[color-mix(in_srgb,var(--color-success)_12%,var(--color-surface))] text-[var(--color-success)]",
  },
  recusado: {
    label: "Recusado",
    icon: FileX2,
    tone: "danger",
    iconBox: "bg-[var(--color-danger)]/10 text-[var(--color-danger)]",
  },
  encerrado: {
    label: "Encerrado",
    icon: Archive,
    tone: "neutral",
    iconBox: "bg-[var(--color-surface-2)] text-[var(--color-muted-2)]",
  },
};

export const MODES: {
  key: Mode;
  title: string;
  desc: string;
  icon: LucideIcon;
}[] = [
  {
    key: "opsform",
    title: "OPS Form",
    desc: "O cliente preenche os dados pelo link no WhatsApp e o contrato nasce sozinho.",
    icon: ClipboardList,
  },
  {
    key: "modelo",
    title: "Preencher aqui",
    desc: "Sua equipe preenche os dados e o PDF é gerado na hora, do modelo oficial.",
    icon: PenLine,
  },
  {
    key: "upload",
    title: "Anexar PDF",
    desc: "Já tem o contrato pronto? Anexa o arquivo e segue pro fluxo de assinatura.",
    icon: Upload,
  },
];

/** Tooltip de dúvida (VibeUX 73): explica sem poluir a interface. */
export function Tip({ text }: { text: string }) {
  return (
    <span
      title={text}
      className="ml-1 inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[11px] font-semibold leading-none text-[var(--color-muted-2)]"
    >
      ?
    </span>
  );
}

export const inputCls =
  "h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]";
export const labelCls =
  "flex flex-col gap-1.5 text-xs font-medium text-[var(--color-muted)]";
export const sectionCls =
  "text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-muted-2)]";
