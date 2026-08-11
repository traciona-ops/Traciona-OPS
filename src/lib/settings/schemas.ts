import { z } from "zod";

export const userRoleSchema = z.enum(["admin", "gestor", "vendedor"]);
export const sectorSchema = z.enum(["vendas", "suporte", "financeiro"]);

export const createTeamMemberSchema = z.object({
  name: z.string().min(1, "Informe o nome."),
  email: z.string().email("E-mail inválido."),
  password: z.string().min(6, "Senha inválida (mínimo 6 caracteres)."),
  role: userRoleSchema,
  sector: sectorSchema,
});

export const updateMemberSectorSchema = z.object({
  id: z.string().uuid("Membro inválido."),
  sector: sectorSchema,
});

export const updateMemberRoleSchema = z.object({
  id: z.string().uuid("Membro inválido."),
  role: userRoleSchema,
});

export const toggleMemberActiveSchema = z.object({
  id: z.string().uuid("Membro inválido."),
  active: z.boolean(),
});

export const deleteTeamMemberSchema = z.object({
  id: z.string().uuid("Membro inválido."),
});

export const setMonthlyGoalSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Mês inválido."),
  target: z
    .number()
    .finite("Valor de meta inválido.")
    .min(0, "Valor de meta inválido."),
});

export const addWaNumberSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Dê um nome pro número (ex.: Financeiro)."),
});

export const renameWaNumberSchema = z.object({
  id: z.string().uuid("Número inválido."),
  name: z.string().trim().min(1, "Nome não pode ficar vazio."),
});

export const removeWaNumberSchema = z.object({
  id: z.string().uuid("Número inválido."),
});
