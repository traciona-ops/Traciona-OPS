import { z } from "zod";

const leadSourceSchema = z.enum([
  "meta_ads",
  "instagram",
  "whatsapp",
  "manual",
  "referral",
  "organic",
]);

const sectorSchema = z.enum(["vendas", "suporte", "financeiro"]);

export const createLeadSchema = z.object({
  name: z.string().min(1, "Informe o nome do lead."),
  phone: z.string().optional(),
  email: z.string().optional(),
  company: z.string().optional(),
  instagram: z.string().optional(),
  source: leadSourceSchema,
  value: z.number().optional(),
  pipeline_id: z.string().uuid("Funil inválido."),
  stage_id: z.string().uuid("Etapa inválida."),
  owner_id: z.string().uuid().nullable().optional(),
  sector: sectorSchema.optional(),
});

export const createContactSchema = z.object({
  name: z.string().min(1, "Informe o nome do contato."),
  phone: z.string().optional(),
  email: z.string().optional(),
  company: z.string().optional(),
});

export const moveLeadSchema = z.object({
  leadId: z.string().uuid("Lead inválido."),
  toStageId: z.string().uuid("Etapa inválida."),
  orderedIds: z.array(z.string().uuid()),
});

export const updateLeadSchema = z.object({
  leadId: z.string().uuid("Lead inválido."),
  patch: z
    .object({
      name: z.string(),
      phone: z.string().nullable(),
      email: z.string().nullable(),
      company: z.string().nullable(),
      instagram: z.string().nullable(),
      value: z.number(),
      owner_id: z.string().uuid().nullable(),
      stage_id: z.string().uuid(),
      source: leadSourceSchema,
      sector: sectorSchema,
    })
    .partial(),
});

export const deleteLeadSchema = z.object({
  leadId: z.string().uuid("Lead inválido."),
});

export const addNoteSchema = z.object({
  leadId: z.string().uuid("Lead inválido."),
  content: z.string(),
});

export const addTagSchema = z.object({
  leadId: z.string().uuid("Lead inválido."),
  tag: z.string().min(1, "Informe a tag."),
  color: z.string().min(1, "Informe a cor."),
});

export const removeTagSchema = z.object({
  tagId: z.string().uuid("Tag inválida."),
  leadId: z.string().uuid("Lead inválido."),
});

export const attachDealSchema = z.object({
  leadId: z.string().uuid("Lead inválido."),
  pipeline_id: z.string().uuid("Funil inválido."),
  stage_id: z.string().uuid("Etapa inválida."),
  value: z.number().optional(),
  source: leadSourceSchema.optional(),
  owner_id: z.string().uuid().nullable().optional(),
  description: z.string().nullable().optional(),
});

export const moveAllLeadsSchema = z
  .object({
    fromStageId: z.string().uuid("Etapa de origem inválida."),
    toStageId: z.string().uuid("Etapa de destino inválida."),
  })
  .refine((v) => v.fromStageId !== v.toStageId, {
    message: "Escolha uma etapa de destino diferente.",
  });

export const transferLeadSchema = z.object({
  leadId: z.string().uuid("Lead inválido."),
  toUserId: z.string().uuid("Usuário inválido."),
  reason: z.string(),
});

export const attachLeadToPipelineSchema = z.object({
  leadId: z.string().uuid("Lead inválido."),
});

export const addLeadToPipelineSchema = z.object({
  leadId: z.string().uuid("Lead inválido."),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type CreateContactInput = z.infer<typeof createContactSchema>;
export type MoveLeadInput = z.infer<typeof moveLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type DeleteLeadInput = z.infer<typeof deleteLeadSchema>;
export type AddNoteInput = z.infer<typeof addNoteSchema>;
export type AddTagInput = z.infer<typeof addTagSchema>;
export type RemoveTagInput = z.infer<typeof removeTagSchema>;
export type AttachDealInput = z.infer<typeof attachDealSchema>;
export type MoveAllLeadsInput = z.infer<typeof moveAllLeadsSchema>;
export type TransferLeadInput = z.infer<typeof transferLeadSchema>;
