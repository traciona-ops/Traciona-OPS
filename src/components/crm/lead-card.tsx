"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Phone,
  Building2,
  UserPlus,
  Check,
  Clock,
  ListChecks,
  TriangleAlert,
  MessageCircle,
  SquareArrowOutUpRight,
  ListPlus,
  ChevronDown,
  Trash2,
  Copy,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { NewTaskDialog } from "./new-task-dialog";
import { currencyBRL, stageTimeInfo, STAGE_LEVEL_STYLE } from "@/lib/utils";
import { useRole } from "@/components/role-context";
import { can } from "@/lib/permissions";
import { updateLead, deleteLead } from "@/app/(dashboard)/crm/actions";
import { toast } from "@/components/ui/toast";
import {
  SOURCE_LABEL,
  type Lead,
  type LeadTag,
  type PipelineStage,
  type Profile,
} from "@/lib/types";

type CardTask = { id: string; done: boolean; due_date: string | null };

export type BoardLead = Lead & {
  tags?: LeadTag[];
  owner?: Profile | null;
  tasks?: CardTask[];
};

function LeadCardBase({
  lead,
  stage,
  team = [],
  currentUserId = "",
  overlay = false,
  dragDisabled = false,
}: {
  lead: BoardLead;
  stage?: PipelineStage;
  team?: Profile[];
  currentUserId?: string;
  overlay?: boolean;
  dragDisabled?: boolean;
}) {
  const router = useRouter();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id, data: { type: "lead", lead }, disabled: dragDisabled });

  const draggedRef = useRef(false);
  useEffect(() => {
    if (isDragging) draggedRef.current = true;
    else if (draggedRef.current) {
      const t = setTimeout(() => (draggedRef.current = false), 60);
      return () => clearTimeout(t);
    }
  }, [isDragging]);

  const [taskOpen, setTaskOpen] = useState(false);

  const style = { transform: CSS.Translate.toString(transform), transition };

  const closed = !!(stage?.is_won || stage?.is_lost);
  const time = stageTimeInfo(lead.stage_changed_at, stage?.sla_days ?? null, closed);
  const levelStyle = STAGE_LEVEL_STYLE[time.level];

  const openTasks = (lead.tasks ?? []).filter((t) => !t.done);
  const today = new Date().toISOString().slice(0, 10);
  const overdueTasks = openTasks.filter((t) => t.due_date && t.due_date < today);

  function handleClick() {
    if (draggedRef.current) return;
    router.push(`/crm/leads/${lead.code ?? lead.id}`);
  }

  // O dnd-kit já deixa o card focável (role=button, tabIndex=0) e usa
  // espaço/setas pra arrastar. Falta abrir o negócio com Enter — sem isso o
  // card recebe foco e não faz nada.
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    handleClick();
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`${lead.name}${lead.company ? ` — ${lead.company}` : ""}${
        time.level === "late" ? " — atrasado" : ""
      }. Enter abre o negócio, espaço move de etapa.`}
      className={`card card-hover group relative cursor-grab p-3 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)] ${
        time.level === "late"
          ? "border-[color-mix(in_srgb,var(--color-danger)_45%,var(--color-border))]"
          : ""
      } ${isDragging ? "opacity-40" : ""} ${
        overlay
          ? "rotate-2 cursor-grabbing shadow-2xl ring-1 ring-[var(--color-primary)]"
          : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Avatar name={lead.name} src={lead.avatar_url} size={28} />
          <p className="min-w-0 flex-1 truncate text-sm font-medium">
            {lead.name}
            {lead.code != null && (
              <span
                className="ml-1.5 text-[11px] font-normal tabular-nums text-[var(--color-muted-2)]"
                title={`Código do negócio: #${lead.code}`}
              >
                #{lead.code}
              </span>
            )}
          </p>
          {lead.ai_score != null && (
            <span
              className="flex shrink-0 items-center gap-0.5 rounded-full bg-[color-mix(in_srgb,var(--color-warning)_14%,var(--color-surface))] px-1.5 py-px text-[11px] font-bold text-[var(--color-warning)]"
              title={`Score IA: ${lead.ai_score}/100`}
            >
              ★ {lead.ai_score}
            </span>
          )}
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium"
          style={{ backgroundColor: levelStyle.bg, color: levelStyle.color }}
          title={
            time.level === "late"
              ? `Atrasado — ${time.label} neste estágio`
              : `${time.label} neste estágio`
          }
        >
          {time.level === "late" ? (
            <>
              <TriangleAlert className="h-3 w-3" />
              Atrasado
            </>
          ) : (
            <>
              <Clock className="h-3 w-3" />
              {time.label}
            </>
          )}
        </span>
      </div>

      {lead.company && (
        <p className="mt-1 flex items-center gap-1 truncate text-xs text-[var(--color-muted)]">
          <Building2 className="h-3 w-3 shrink-0" />
          {lead.company}
        </p>
      )}
      {lead.phone && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-[var(--color-muted)]">
          <Phone className="h-3 w-3 shrink-0" />
          {lead.phone}
        </p>
      )}

      {lead.tags && lead.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {lead.tags.map((t) => (
            <span
              key={t.id}
              className="rounded px-1.5 py-0.5 text-[11px] font-medium"
              style={{ backgroundColor: `${t.color}22`, color: t.color }}
            >
              {t.tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--color-muted)]">
            {SOURCE_LABEL[lead.source]}
          </span>
          {openTasks.length > 0 && (
            <span
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium"
              style={
                overdueTasks.length > 0
                  ? {
                      backgroundColor:
                        "color-mix(in srgb, var(--color-danger) 14%, var(--color-surface))",
                      color: "var(--color-danger)",
                    }
                  : { backgroundColor: "var(--color-surface-2)", color: "var(--color-muted)" }
              }
              title={`${openTasks.length} tarefa(s) aberta(s)`}
            >
              <ListChecks className="h-3 w-3" />
              {openTasks.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lead.value > 0 && (
            <span className="text-xs font-semibold text-[var(--color-success)]">
              {currencyBRL(lead.value)}
            </span>
          )}
          {overlay ? (
            lead.owner && (
              <Avatar name={lead.owner.name} src={lead.owner.avatar_url} size={22} />
            )
          ) : (
            <AssignControl lead={lead} team={team} />
          )}
        </div>
      </div>

      {!overlay && (
        <div className="mt-2.5 flex items-center gap-1 border-t border-[var(--color-border)] pt-2">
          <CardAction
            icon={MessageCircle}
            label="Conversa"
            title="Abrir conversa"
            onClick={() => router.push(`/crm/mensagens?lead=${lead.id}`)}
          />
          <CardAction
            icon={SquareArrowOutUpRight}
            label="Card"
            onClick={() => router.push(`/crm/leads/${lead.code ?? lead.id}`)}
          />
          <CardAction
            icon={ListPlus}
            label="Tarefa"
            onClick={() => setTaskOpen(true)}
          />
          <MaisMenu lead={lead} />
        </div>
      )}

      {taskOpen && (
        <NewTaskDialog
          leadId={lead.id}
          leadName={lead.name}
          team={team}
          defaultAssignee={currentUserId}
          onClose={() => setTaskOpen(false)}
        />
      )}
    </div>
  );
}

// O board recarrega sozinho (polling de 60s, realtime, refresh ao focar a aba)
// e cada refresh troca a referência do array de leads. Sem memo, todos os cards
// do funil re-renderizam mesmo quando nada mudou neles.
export const LeadCard = memo(LeadCardBase, (prev, next) => {
  const a = prev.lead;
  const b = next.lead;
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.company === b.company &&
    a.phone === b.phone &&
    a.value === b.value &&
    a.owner_id === b.owner_id &&
    a.owner?.name === b.owner?.name &&
    a.owner?.avatar_url === b.owner?.avatar_url &&
    a.avatar_url === b.avatar_url &&
    a.ai_score === b.ai_score &&
    a.stage_changed_at === b.stage_changed_at &&
    a.source === b.source &&
    a.code === b.code &&
    a.tags?.length === b.tags?.length &&
    a.tasks?.length === b.tasks?.length &&
    a.tasks?.filter((t) => !t.done).length ===
      b.tasks?.filter((t) => !t.done).length &&
    prev.stage?.id === next.stage?.id &&
    prev.stage?.sla_days === next.stage?.sla_days &&
    prev.stage?.is_won === next.stage?.is_won &&
    prev.stage?.is_lost === next.stage?.is_lost &&
    prev.team === next.team &&
    prev.currentUserId === next.currentUserId &&
    prev.overlay === next.overlay &&
    prev.dragDisabled === next.dragDisabled
  );
});
LeadCard.displayName = "LeadCard";

function CardAction({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      disabled={disabled}
      title={title}
      className="flex min-h-9 flex-1 items-center justify-center gap-1 rounded-[var(--radius-control)] border border-[var(--color-border)] px-1 text-[11px] font-medium text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

function MaisMenu({ lead }: { lead: BoardLead }) {
  const router = useRouter();
  const role = useRole();
  const [open, setOpen] = useState(false);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  async function remove() {
    if (
      !confirm(
        `Excluir o card "${lead.name}" do funil?\nSe houver conversa no WhatsApp, o contato continua no OPS Chat.`
      )
    )
      return;
    const r = await deleteLead(lead.id);
    if (r && "detached" in r && r.detached) {
      toast("Card removido — o contato continua no OPS Chat.");
    }
    router.refresh();
  }

  return (
    <div className="relative" onPointerDown={stop} onClick={stop}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex min-h-9 flex-1 items-center justify-center gap-1 rounded-[var(--radius-control)] border border-[var(--color-border)] px-2 text-[11px] font-medium text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
      >
        Mais
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-8 right-0 z-20 w-40 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-1 shadow-xl">
            {lead.phone && (
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(lead.phone!);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--color-surface-2)]"
              >
                <Copy className="h-3.5 w-3.5" />
                Copiar telefone
              </button>
            )}
            {can.deleteLead(role) && (
              <button
                onClick={() => {
                  setOpen(false);
                  remove();
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Excluir card
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AssignControl({ lead, team }: { lead: BoardLead; team: Profile[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function assign(ownerId: string | null) {
    setBusy(true);
    await updateLead(lead.id, { owner_id: ownerId });
    setBusy(false);
    setOpen(false);
    router.refresh();
  }

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div className="relative" onPointerDown={stop} onClick={stop}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="grid h-9 w-9 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        aria-label={
          lead.owner
            ? `Responsável: ${lead.owner.name}. Trocar.`
            : "Atribuir responsável"
        }
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {lead.owner ? (
          <Avatar name={lead.owner.name} src={lead.owner.avatar_url} size={22} />
        ) : (
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full border border-dashed border-[var(--color-border-strong)] text-[var(--color-muted-2)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
            <UserPlus className="h-3 w-3" />
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-7 z-20 w-44 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-1 shadow-xl">
            {team.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-[var(--color-muted-2)]">
                Sem membros. Adicione em Configurações.
              </p>
            )}
            {team.map((m) => (
              <button
                key={m.id}
                disabled={busy}
                onClick={() => assign(m.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--color-surface-2)]"
              >
                <Avatar name={m.name} src={m.avatar_url} size={20} />
                <span className="flex-1 truncate">{m.name}</span>
                {lead.owner_id === m.id && (
                  <Check className="h-3.5 w-3.5 text-[var(--color-primary)]" />
                )}
              </button>
            ))}
            {lead.owner_id && (
              <button
                disabled={busy}
                onClick={() => assign(null)}
                className="mt-0.5 w-full rounded-md px-2 py-1.5 text-left text-xs text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
              >
                Remover responsável
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
