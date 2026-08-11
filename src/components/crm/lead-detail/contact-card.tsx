"use client";

import {
  Phone,
  Mail,
  Instagram,
  Building2,
  Pencil,
  Check,
  X,
  Loader2,
  Trash2,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { currencyBRL, formatPhone } from "@/lib/utils/ui";
import { can } from "@/lib/permissions";
import { SOURCE_LABEL } from "@/lib/data/labels";
import type { UserRole } from "@/lib/types";
import { InfoRow, LabeledInput } from "./helpers";
import type { ContactForm, LeadDetailProps } from "./types";

type ContactCardProps = {
  lead: LeadDetailProps["lead"];
  role: UserRole;
  editing: boolean;
  saving: boolean;
  deleting: boolean;
  form: ContactForm;
  onFormChange: (form: ContactForm) => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onDelete: () => void;
};

export function ContactCard({
  lead,
  role,
  editing,
  saving,
  deleting,
  form,
  onFormChange,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: ContactCardProps) {
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar name={lead.name} src={lead.avatar_url} size={44} />
          <div>
            <h2 className="text-lg font-semibold">
              {lead.name}
              {lead.code != null && (
                <span
                  className="ml-2 text-sm font-normal tabular-nums text-[var(--color-muted-2)]"
                  title="Código do negócio — busque por ele no Ctrl+K"
                >
                  #{lead.code}
                </span>
              )}
            </h2>
            <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--color-muted)]">
              {SOURCE_LABEL[lead.source]}
            </span>
          </div>
        </div>
        {!editing ? (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </Button>
            {can.deleteLead(role) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                disabled={deleting}
                className="text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
                aria-label="Excluir lead"
                title="Excluir lead"
              >
                {deleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
          </div>
        ) : (
          <div className="flex gap-1">
            <Button size="sm" onClick={onSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Salvar
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancelEdit}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput
            label="Nome"
            value={form.name}
            onChange={(v) => onFormChange({ ...form, name: v })}
          />
          <LabeledInput
            label="WhatsApp"
            value={form.phone}
            onChange={(v) => onFormChange({ ...form, phone: v })}
          />
          <LabeledInput
            label="E-mail"
            value={form.email}
            onChange={(v) => onFormChange({ ...form, email: v })}
          />
          <LabeledInput
            label="Empresa"
            value={form.company}
            onChange={(v) => onFormChange({ ...form, company: v })}
          />
          <LabeledInput
            label="Instagram"
            value={form.instagram}
            onChange={(v) => onFormChange({ ...form, instagram: v })}
          />
          <LabeledInput
            label="Valor (R$)"
            value={form.value}
            onChange={(v) => onFormChange({ ...form, value: v })}
            type="number"
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <InfoRow icon={Phone} value={lead.phone ? formatPhone(lead.phone) : "—"} />
          <InfoRow icon={Mail} value={lead.email ?? "—"} />
          <InfoRow icon={Building2} value={lead.company ?? "—"} />
          <InfoRow icon={Instagram} value={lead.instagram ?? "—"} />
        </div>
      )}

      {lead.value > 0 && !editing && (
        <p className="mt-3 text-sm">
          <span className="text-[var(--color-muted)]">Valor: </span>
          <span className="font-semibold text-[var(--color-success)]">
            {currencyBRL(lead.value)}
          </span>
        </p>
      )}
    </div>
  );
}
