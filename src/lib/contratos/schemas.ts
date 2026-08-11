import { z } from "zod";
import { MAX_CONTRACT_PDF_BYTES } from "@/lib/contratos/storage";
import { formatPhone } from "@/lib/utils/ui";

const pdfFileSchema = z
  .custom<File | Blob>(
    (v) =>
      !!v &&
      typeof v === "object" &&
      typeof (v as Blob).arrayBuffer === "function" &&
      typeof (v as Blob).size === "number" &&
      (v as Blob).size > 0,
    { message: "Anexe o PDF do contrato." }
  )
  .refine(
    (f) =>
      !("type" in f) || (f as File).type === "application/pdf",
    { message: "O arquivo precisa ser um PDF." }
  )
  .refine((f) => f.size <= MAX_CONTRACT_PDF_BYTES, {
    message: "PDF muito grande (máx. 4,5 MB).",
  });

export const createContractSchema = z.object({
  leadId: z.string().min(1, "Escolha o cliente."),
  title: z.string().min(1, "Dê um título ao contrato."),
  value: z.number().nullable(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  signerEmail: z.string().nullable(),
  file: pdfFileSchema,
  createdBy: z.string().nullable(),
});

export type CreateContractInput = z.infer<typeof createContractSchema>;

export function parseCreateContractForm(
  form: FormData,
  createdBy: string | null
): { data: CreateContractInput } | { error: string } {
  const valueRaw = String(form.get("value") ?? "").replace(",", ".");
  const parsed = createContractSchema.safeParse({
    leadId: String(form.get("lead_id") ?? ""),
    title: String(form.get("title") ?? "").trim(),
    value: valueRaw ? Number(valueRaw) : null,
    startsAt: String(form.get("starts_at") ?? "") || null,
    endsAt: String(form.get("ends_at") ?? "") || null,
    signerEmail: String(form.get("signer_email") ?? "").trim() || null,
    file: form.get("file"),
    createdBy,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  return { data: parsed.data };
}

export const generateFromTemplateSchema = z
  .object({
    tipo: z.enum(["pf", "pj"]),
    cnpj: z.string(),
    representante: z.string(),
    contratanteNome: z.string(),
    nacionalidade: z.string(),
    estadoCivil: z.string(),
    profissao: z.string(),
    rg: z.string(),
    cpf: z.string(),
    endereco: z.string(),
    telefone: z.string(),
    email: z.string(),
    empresa: z.string(),
    prazoMeses: z.number(),
    dataInicio: z.date().nullable(),
    valorMensal: z.number(),
    diaVencimento: z.number(),
    comarca: z.string(),
  })
  .superRefine((v, ctx) => {
    if (!v.cpf || !v.endereco) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Preencha ao menos CPF e endereço do cliente.",
      });
    }
    if (v.tipo === "pj") {
      if (v.cnpj.replace(/\D/g, "").length !== 14) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CNPJ inválido (14 dígitos).",
          path: ["cnpj"],
        });
      }
      if (!v.representante) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Informe quem assina pela empresa.",
          path: ["representante"],
        });
      }
    }
    if (!v.prazoMeses || v.prazoMeses < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe o prazo em meses.",
        path: ["prazoMeses"],
      });
    }
    if (!v.dataInicio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe a data de início.",
        path: ["dataInicio"],
      });
    }
    if (!v.valorMensal || v.valorMensal <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe o valor mensal.",
        path: ["valorMensal"],
      });
    }
    if (!v.diaVencimento || v.diaVencimento < 1 || v.diaVencimento > 31) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Dia de vencimento entre 1 e 31.",
        path: ["diaVencimento"],
      });
    }
    if (!v.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe o e-mail do cliente (vai no contrato).",
        path: ["email"],
      });
    }
  });

export type GenerateFromTemplateFields = z.infer<
  typeof generateFromTemplateSchema
>;

/** Campos validados com dataInicio garantido (após superRefine). */
export type GenerateFromTemplateInput = Omit<
  GenerateFromTemplateFields,
  "dataInicio"
> & { dataInicio: Date };

export function parseGenerateFromTemplateForm(
  form: FormData,
  lead: { name: string; phone: string | null; email: string | null }
): { data: GenerateFromTemplateInput } | { error: string } {
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const dataInicioRaw = s("data_inicio");
  const parsed = generateFromTemplateSchema.safeParse({
    tipo: s("tipo") === "pj" ? "pj" : "pf",
    cnpj: s("cnpj"),
    representante: s("representante"),
    contratanteNome: s("nome") || lead.name,
    nacionalidade: s("nacionalidade") || "brasileiro(a)",
    estadoCivil: s("estado_civil"),
    profissao: s("profissao"),
    rg: s("rg"),
    cpf: s("cpf"),
    endereco: s("endereco"),
    telefone: s("telefone") || (lead.phone ? formatPhone(lead.phone) : ""),
    email: s("email") || (lead.email ?? ""),
    empresa: s("empresa"),
    prazoMeses: Number(s("prazo_meses") || 0),
    dataInicio: dataInicioRaw
      ? new Date(`${dataInicioRaw}T12:00:00-03:00`)
      : null,
    valorMensal: Number(
      s("valor_mensal").replace(/\./g, "").replace(",", ".") || 0
    ),
    diaVencimento: Number(s("dia_vencimento") || 0),
    comarca: s("comarca") || "Acreúna – Goiás",
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;
  if (!d.dataInicio)
    return { error: "Informe a data de início." };
  return { data: { ...d, dataInicio: d.dataInicio } };
}
