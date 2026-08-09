"use client";

import { useState } from "react";
import { ArrowRightLeft, Ban, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRole } from "@/components/context/role-context";
import { can } from "@/lib/permissions";
import { currencyBRL } from "@/lib/utils/ui";
import { transferLead, updateLead } from "@/app/(dashboard)/crm/actions";
import { SECTION_LABEL, SELECT, type RunMutation } from "@/components/chat/conversation/lead-panel/ui";
import { type Sector } from "@/lib/types";
import { SECTOR } from "@/lib/data/labels";
import type { LeadContext } from "@/components/chat/types";

/** Etapa, ganho/perdido, responsável, setor e valor do lead. */
export function LeadFields({
  lead,
  stages,
  team,
  currentUserId,
  busy,
  run,
}: {
  lead: LeadContext["lead"];
  stages: LeadContext["stages"];
  team: LeadContext["team"];
  currentUserId: string;
  busy: boolean;
  run: RunMutation;
}) {
  const role = useRole();
  const [val, setVal] = useState(String(lead.value ?? 0));
  const wonStage = stages.find((s) => s.is_won);
  const lostStage = stages.find((s) => s.is_lost);

  return (
    <>
      {/* Etapa */}
      <div className={!lead.pipeline_id ? "hidden" : undefined}>
        <label className={SECTION_LABEL}>Etapa</label>
        <select
          value={lead.stage_id ?? ""}
          disabled={busy}
          onChange={(e) => run(() => updateLead(lead.id, { stage_id: e.target.value }))}
          className={SELECT}
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="mt-2 flex gap-2">
          {wonStage && (
            <button
              disabled={busy}
              onClick={() => run(() => updateLead(lead.id, { stage_id: wonStage.id }))}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[var(--color-success)]/15 py-1.5 text-xs font-medium text-[var(--color-success)] hover:bg-[var(--color-success)]/25"
            >
              <Trophy className="h-3.5 w-3.5" /> Ganho
            </button>
          )}
          {lostStage && (
            <button
              disabled={busy}
              onClick={() => run(() => updateLead(lead.id, { stage_id: lostStage.id }))}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[var(--color-danger)]/10 py-1.5 text-xs font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger)]/20"
            >
              <Ban className="h-3.5 w-3.5" /> Perdido
            </button>
          )}
        </div>
      </div>

      {/* Responsável (transferir) */}
      {can.transferLead(role) && (
        <div>
          <label className={SECTION_LABEL}>Responsável</label>
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 shrink-0 text-[var(--color-muted)]" />
            <select
              value={lead.owner_id ?? ""}
              disabled={busy}
              onChange={(e) => run(() => transferLead(lead.id, e.target.value, ""))}
              className={SELECT}
            >
              <option value="">Sem responsável</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === currentUserId ? `${m.name} (eu)` : m.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Setor */}
      <div>
        <label className={SECTION_LABEL}>Setor</label>
        {role === "admin" ? (
          <select
            value={lead.sector}
            disabled={busy}
            onChange={(e) =>
              run(() => updateLead(lead.id, { sector: e.target.value as Sector }))
            }
            className={SELECT}
          >
            {(Object.keys(SECTOR) as Sector[]).map((s) => (
              <option key={s} value={s}>
                {SECTOR[s].label}
              </option>
            ))}
          </select>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: `${SECTOR[lead.sector].color}22`,
              color: SECTOR[lead.sector].color,
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: SECTOR[lead.sector].color }}
            />
            {SECTOR[lead.sector].label}
          </span>
        )}
      </div>

      {/* Valor */}
      <div>
        <label className={SECTION_LABEL}>
          Valor ({currencyBRL(lead.value || 0)})
        </label>
        <div className="flex gap-2">
          <Input
            type="number"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="h-9 text-sm"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => run(() => updateLead(lead.id, { value: Number(val) || 0 }))}
          >
            Salvar
          </Button>
        </div>
      </div>
    </>
  );
}
