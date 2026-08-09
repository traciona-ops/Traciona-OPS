"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Plus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { addLeadToPipeline } from "@/app/(dashboard)/crm/actions";
import { SOURCE_LABEL } from "@/lib/data/labels";
import { LeadFields } from "@/components/chat/conversation/lead-panel/lead-fields";
import { TagsSection } from "@/components/chat/conversation/lead-panel/tags-section";
import { TasksSection } from "@/components/chat/conversation/lead-panel/tasks-section";
import {
  MeetingsSection,
  ScheduledMessagesSection,
} from "@/components/chat/conversation/lead-panel/meetings-section";
import { NotesSection } from "@/components/chat/conversation/lead-panel/notes-section";
import type { LeadContext } from "@/components/chat/types";

/**
 * Painel lateral do lead no chat: etapa, responsável, valor, tags, tarefas,
 * reuniões, mensagens agendadas e notas internas.
 */
export function LeadPanel({
  context,
  currentUserId,
  onChanged,
}: {
  context: LeadContext;
  currentUserId: string;
  /** Chamado após cada mutação (o dock usa pra re-buscar o contexto). */
  onChanged?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const { lead, stages, team, tasks, notes, meetings, scheduled } = context;
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    await fn();
    setBusy(false);
    router.refresh();
    await onChanged?.();
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="space-y-4 p-4">
        {/* Cabeçalho */}
        <div className="flex items-center gap-3">
          <Avatar name={lead.name} src={lead.avatar_url} size={42} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{lead.name}</p>
            <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--color-muted)]">
              {SOURCE_LABEL[lead.source]}
            </span>
          </div>
          <Link
            href={`/crm/leads/${lead.id}`}
            className="ml-auto text-[var(--color-muted)] hover:text-[var(--color-primary)]"
            title="Abrir lead"
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>

        {/* Fora do funil: card é opcional — adiciona quando quiser */}
        {!lead.pipeline_id && (
          <div className="rounded-lg border border-[#f59e0b]/30 bg-[#f59e0b]/8 p-3">
            <p className="text-xs text-[var(--color-muted)]">
              Este contato está <b>só no chat</b> — ainda não tem card no funil.
            </p>
            <button
              disabled={busy}
              onClick={() => run(() => addLeadToPipeline(lead.id))}
              className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--color-primary)] text-xs font-semibold text-[var(--color-primary-foreground)] transition hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar ao funil
            </button>
          </div>
        )}

        <LeadFields
          lead={lead}
          stages={stages}
          team={team}
          currentUserId={currentUserId}
          busy={busy}
          run={run}
        />
        <TagsSection leadId={lead.id} tags={lead.tags} run={run} />
        <TasksSection
          leadId={lead.id}
          tasks={tasks}
          currentUserId={currentUserId}
          run={run}
        />
        <MeetingsSection
          leadId={lead.id}
          meetings={meetings}
          busy={busy}
          run={run}
        />
        <ScheduledMessagesSection
          leadId={lead.id}
          scheduled={scheduled}
          run={run}
        />
        <NotesSection leadId={lead.id} notes={notes} busy={busy} run={run} />
      </div>
    </aside>
  );
}
