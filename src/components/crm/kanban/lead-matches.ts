import type { BoardLead } from "../lead-card";
import type { LeadFilter } from "../filter-bar";
import { stageTimeInfo } from "@/lib/utils/ui";
import type { PipelineStage } from "@/lib/types";

export function leadMatches(
  lead: BoardLead,
  stage: PipelineStage,
  filter: LeadFilter
): boolean {
  const q = filter.q.trim().toLowerCase();
  if (q) {
    const hay = `${lead.name} ${lead.company ?? ""} ${lead.phone ?? ""} ${
      lead.email ?? ""
    }`.toLowerCase();
    // Identificação por número: código exato (#42 ou 42) e celular
    // com qualquer formatação (compara só os dígitos, mínimo 4).
    const digits = q.replace(/\D/g, "");
    const codeHit = digits !== "" && String(lead.code ?? "") === digits;
    const phoneHit =
      digits.length >= 4 &&
      (lead.phone ?? "").replace(/\D/g, "").includes(digits);
    if (!hay.includes(q) && !codeHit && !phoneHit) return false;
  }
  if (filter.ownerId === "none" && lead.owner_id) return false;
  if (filter.ownerId && filter.ownerId !== "none" && lead.owner_id !== filter.ownerId)
    return false;
  if (filter.source && lead.source !== filter.source) return false;
  if (filter.late) {
    const closed = stage.is_won || stage.is_lost;
    const info = stageTimeInfo(lead.stage_changed_at, stage.sla_days, closed);
    if (info.level !== "late") return false;
  }
  if (filter.withTask && !(lead.tasks ?? []).some((t) => !t.done)) return false;
  if (filter.createdFrom || filter.createdTo) {
    const created = new Date(lead.created_at);
    if (filter.createdFrom && created < new Date(`${filter.createdFrom}T00:00:00`))
      return false;
    if (filter.createdTo && created > new Date(`${filter.createdTo}T23:59:59`))
      return false;
  }
  return true;
}
