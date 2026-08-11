"use client";

import Link from "next/link";
import { ArrowLeft, X, Plus, ArrowRightLeft, MessageSquare } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { can } from "@/lib/permissions";
import type { Profile, UserRole } from "@/lib/types";
import { TransferForm } from "./transfer-form";
import type { LeadDetailProps } from "./types";

export function LeadSidebar({
  lead,
  team,
  role,
  transfers,
  showTransfer,
  newTag,
  onShowTransferChange,
  onNewTagChange,
  onSubmitTag,
  onRemoveTag,
  onTransferDone,
}: {
  lead: LeadDetailProps["lead"];
  team: Profile[];
  role: UserRole;
  transfers: LeadDetailProps["transfers"];
  showTransfer: boolean;
  newTag: string;
  onShowTransferChange: (show: boolean) => void;
  onNewTagChange: (value: string) => void;
  onSubmitTag: () => void;
  onRemoveTag: (tagId: string) => void;
  onTransferDone: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="card p-5">
        <h3 className="mb-3 text-sm font-semibold">Responsável</h3>
        {lead.owner ? (
          <div className="flex items-center gap-2">
            <Avatar name={lead.owner.name} src={lead.owner.avatar_url} size={32} />
            <span className="text-sm">{lead.owner.name}</span>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-muted-2)]">Sem responsável</p>
        )}
        {can.transferLead(role) && (
          <>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3 w-full"
              onClick={() => onShowTransferChange(!showTransfer)}
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Transferir lead
            </Button>
            {showTransfer && (
              <TransferForm leadId={lead.id} team={team} onDone={onTransferDone} />
            )}
          </>
        )}
      </div>

      <div className="card p-5">
        <h3 className="mb-3 text-sm font-semibold">Tags</h3>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {lead.tags.length === 0 && (
            <p className="text-sm text-[var(--color-muted-2)]">Sem tags</p>
          )}
          {lead.tags.map((t) => (
            <span
              key={t.id}
              className="group inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: `${t.color}22`, color: t.color }}
            >
              {t.tag}
              <button
                onClick={() => onRemoveTag(t.id)}
                className="opacity-50 hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newTag}
            onChange={(e) => onNewTagChange(e.target.value)}
            placeholder="Nova tag"
            onKeyDown={(e) => e.key === "Enter" && onSubmitTag()}
            className="h-8 text-xs"
          />
          <Button size="sm" variant="secondary" onClick={onSubmitTag}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-[var(--color-success)]" />
          <h3 className="text-sm font-semibold">WhatsApp</h3>
        </div>
        {lead.phone ? (
          <Link
            href={`/crm/mensagens?lead=${lead.id}`}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-success)]/15 px-3 py-2 text-sm font-medium text-[var(--color-success)] hover:bg-[var(--color-success)]/25"
          >
            <MessageSquare className="h-4 w-4" />
            Abrir conversa
          </Link>
        ) : (
          <p className="text-sm text-[var(--color-muted-2)]">
            Lead sem telefone — adicione um número para conversar.
          </p>
        )}
      </div>

      <div className="card p-5">
        <h3 className="mb-3 text-sm font-semibold">Histórico de transferências</h3>
        {transfers.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-2)]">Nenhuma.</p>
        ) : (
          <div className="space-y-2">
            {transfers.map((t) => (
              <div key={t.id} className="text-xs text-[var(--color-muted)]">
                <span className="text-[var(--color-foreground)]">{t.from?.name ?? "—"}</span> →{" "}
                <span className="text-[var(--color-foreground)]">{t.to?.name ?? "—"}</span>
                {t.reason && <span> · {t.reason}</span>}
                <span className="block text-[11px] text-[var(--color-muted-2)]">
                  {new Date(t.created_at).toLocaleString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
