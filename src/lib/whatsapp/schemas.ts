import { z } from "zod";

export const startConversationSchema = z.object({
  phone: z.string().min(1),
  name: z.string().optional(),
});

export const deleteConversationSchema = z.object({
  leadId: z.string().uuid(),
});

export const sendWhatsappMessageSchema = z.object({
  leadId: z.string().uuid(),
  body: z.string().min(1, "Mensagem vazia."),
  replyTo: z
    .object({
      providerMsgId: z.string().nullable(),
      body: z.string().nullable(),
      direction: z.enum(["in", "out"]),
    })
    .optional(),
});

export const sendWhatsappMediaSchema = z.object({
  leadId: z.string().uuid({ message: "Dados incompletos." }),
  caption: z.string().default(""),
  file: z
    .custom<File>(
      (v) => typeof File !== "undefined" && v instanceof File,
      { message: "Dados incompletos." }
    )
    .refine((f) => f.size <= 30 * 1024 * 1024, {
      message: "Arquivo acima de 30MB.",
    }),
});

export const scheduleMessageSchema = z.object({
  leadId: z.string().uuid(),
  body: z.string().min(1, "Mensagem vazia."),
  sendAt: z
    .string()
    .min(1, "Escolha a data/hora do envio.")
    .refine((s) => new Date(s).getTime() > Date.now(), {
      message: "A data/hora precisa ser no futuro.",
    }),
});

export const cancelScheduledMessageSchema = z.object({
  id: z.string().uuid(),
  leadId: z.string().uuid(),
});

export const reactToMessageSchema = z.object({
  leadId: z.string().uuid(),
  messageId: z.string().min(1),
  direction: z.enum(["in", "out"]),
  emoji: z.string(),
});

export const deleteMessageForAllSchema = z.object({
  leadId: z.string().uuid(),
  providerMsgId: z.string().min(1),
});

export const editWhatsappMessageSchema = z.object({
  leadId: z.string().uuid(),
  providerMsgId: z.string().min(1),
  newBody: z.string().min(1, "Mensagem não pode ficar vazia."),
});

export type StartConversationInput = z.infer<typeof startConversationSchema>;
export type DeleteConversationInput = z.infer<typeof deleteConversationSchema>;
export type SendWhatsappMessageInput = z.infer<typeof sendWhatsappMessageSchema>;
export type SendWhatsappMediaInput = z.infer<typeof sendWhatsappMediaSchema>;
export type ScheduleMessageInput = z.infer<typeof scheduleMessageSchema>;
export type CancelScheduledMessageInput = z.infer<
  typeof cancelScheduledMessageSchema
>;
export type ReactToMessageInput = z.infer<typeof reactToMessageSchema>;
export type DeleteMessageForAllInput = z.infer<typeof deleteMessageForAllSchema>;
export type EditWhatsappMessageInput = z.infer<typeof editWhatsappMessageSchema>;
