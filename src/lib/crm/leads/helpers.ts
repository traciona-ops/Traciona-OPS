import type { PostgrestError } from "@supabase/supabase-js";
import { can } from "@/lib/permissions";
import type { Sector, UserRole } from "@/lib/types";
import type { CrmDb } from "@/lib/crm/supabase-db";
import { topPositionInStage } from "@/lib/crm/pipeline-placement";

export function resolveOwnerIdForCreate(
  role: UserRole,
  userId: string | undefined,
  requestedOwnerId?: string | null
): string | null {
  return can.viewAllLeads(role)
    ? requestedOwnerId || userId || null
    : userId ?? null;
}

export function resolveSectorForCreate(
  role: UserRole,
  profileSector: Sector,
  requestedSector?: Sector
): Sector {
  return role === "admin" ? requestedSector ?? profileSector : profileSector;
}

export function duplicatePhoneError(error: PostgrestError | { code?: string; message: string }) {
  if (error.code === "23505" || error.message.includes("ux_leads_canonical_phone")) {
    return "Já existe um lead com esse número de telefone.";
  }
  return null;
}

export function duplicateContactPhoneError(
  error: PostgrestError | { code?: string; message: string }
) {
  if (error.code === "23505" || error.message.includes("ux_leads_canonical_phone")) {
    return "Já existe um contato com esse número de telefone.";
  }
  return null;
}

export async function nextTopPositionForStage(db: CrmDb, stageId: string) {
  return topPositionInStage(db, stageId);
}
