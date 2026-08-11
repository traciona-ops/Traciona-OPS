import type { CrmDb } from "@/lib/crm/supabase-db";
import type { LeadSource, Sector } from "@/lib/types";
import {
  duplicateContactPhoneError,
  duplicatePhoneError,
  nextTopPositionForStage,
} from "./helpers";

export type CreateLeadDomainInput = {
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  instagram?: string;
  source: LeadSource;
  value?: number;
  pipeline_id: string;
  stage_id: string;
  owner_id: string | null;
  sector: Sector;
};

export async function createLeadDomain(
  db: CrmDb,
  input: CreateLeadDomainInput
): Promise<{ id: string } | { error: string }> {
  const position = await nextTopPositionForStage(db, input.stage_id);

  const { data, error } = await db
    .from("leads")
    .insert({
      name: input.name,
      phone: input.phone || null,
      email: input.email || null,
      company: input.company || null,
      instagram: input.instagram || null,
      source: input.source,
      value: input.value ?? 0,
      pipeline_id: input.pipeline_id,
      stage_id: input.stage_id,
      owner_id: input.owner_id,
      sector: input.sector,
      position,
    })
    .select("id")
    .single();

  if (error) {
    const dup = duplicatePhoneError(error);
    if (dup) return { error: dup };
    return { error: error.message };
  }
  return { id: data.id };
}

export type CreateContactDomainInput = {
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  owner_id: string;
  sector: Sector;
};

export async function createContactDomain(
  db: CrmDb,
  input: CreateContactDomainInput
): Promise<{ id: string } | { error: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Informe o nome do contato." };

  const { data, error } = await db
    .from("leads")
    .insert({
      name,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      company: input.company?.trim() || null,
      source: "manual",
      value: 0,
      pipeline_id: null,
      stage_id: null,
      owner_id: input.owner_id,
      sector: input.sector,
    })
    .select("id")
    .single();

  if (error) {
    const dup = duplicateContactPhoneError(error);
    if (dup) return { error: dup };
    return { error: error.message };
  }
  return { id: data.id };
}
