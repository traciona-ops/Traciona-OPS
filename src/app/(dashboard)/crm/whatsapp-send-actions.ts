"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTextToLead } from "@/lib/whatsapp/send-text-to-lead";
import { sendWhatsappMediaDomain } from "@/lib/whatsapp/send-media";
import {
  scheduleMessageDomain,
  cancelScheduledMessageDomain,
  reactToMessageDomain,
  deleteMessageForAllDomain,
  editWhatsappMessageDomain,
} from "@/lib/whatsapp/message-ops";
import {
  sendWhatsappMessageSchema,
  sendWhatsappMediaSchema,
  scheduleMessageSchema,
  cancelScheduledMessageSchema,
  reactToMessageSchema,
  deleteMessageForAllSchema,
  editWhatsappMessageSchema,
} from "@/lib/whatsapp/schemas";

export async function sendWhatsappMessage(
  leadId: string,
  body: string,
  replyTo?: {
    providerMsgId: string | null;
    body: string | null;
    direction: "in" | "out";
  }
): Promise<{ error?: string; ok?: true }> {
  const parsed = sendWhatsappMessageSchema.safeParse({ leadId, body, replyTo });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const result = await sendTextToLead(supabase, {
    leadId: parsed.data.leadId,
    body: parsed.data.body,
    sentBy: user?.id ?? null,
    replyTo: parsed.data.replyTo,
  });

  revalidatePath("/crm/mensagens");
  revalidatePath("/crm/leads/[id]", "page");
  if ("error" in result) return { error: result.error };
  return { ok: true };
}

export async function sendWhatsappMedia(formData: FormData) {
  const parsed = sendWhatsappMediaSchema.safeParse({
    leadId: String(formData.get("leadId") || ""),
    caption: String(formData.get("caption") || ""),
    file: formData.get("file"),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const result = await sendWhatsappMediaDomain(
    supabase,
    createAdminClient(),
    {
      leadId: parsed.data.leadId,
      caption: parsed.data.caption,
      file: parsed.data.file,
      sentBy: user?.id ?? null,
    }
  );

  revalidatePath("/crm/mensagens");
  revalidatePath("/crm/leads/[id]", "page");
  return result;
}

export async function scheduleMessage(
  leadId: string,
  body: string,
  sendAt: string
) {
  const parsed = scheduleMessageSchema.safeParse({ leadId, body, sendAt });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const result = await scheduleMessageDomain(supabase, {
    leadId: parsed.data.leadId,
    body: parsed.data.body,
    sendAt: parsed.data.sendAt,
    createdBy: user?.id ?? null,
  });

  if ("error" in result) return result;
  revalidatePath("/crm/mensagens");
  revalidatePath("/crm/leads/[id]", "page");
  return { ok: true };
}

export async function cancelScheduledMessage(id: string, leadId: string) {
  const parsed = cancelScheduledMessageSchema.safeParse({ id, leadId });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createClient();
  const result = await cancelScheduledMessageDomain(supabase, parsed.data);
  if ("error" in result) return result;
  revalidatePath("/crm/mensagens");
  revalidatePath("/crm/leads/[id]", "page");
  return { ok: true };
}

export async function reactToMessage(
  leadId: string,
  messageId: string,
  direction: "in" | "out",
  emoji: string
) {
  const parsed = reactToMessageSchema.safeParse({
    leadId,
    messageId,
    direction,
    emoji,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createClient();
  const result = await reactToMessageDomain(supabase, parsed.data);
  if ("error" in result) return result;
  revalidatePath("/crm/mensagens");
  return { ok: true };
}

export async function deleteMessageForAll(
  leadId: string,
  providerMsgId: string
) {
  const parsed = deleteMessageForAllSchema.safeParse({ leadId, providerMsgId });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createClient();
  const result = await deleteMessageForAllDomain(supabase, parsed.data);
  if ("error" in result) return result;
  revalidatePath("/crm/mensagens");
  return { ok: true };
}

export async function editWhatsappMessage(
  leadId: string,
  providerMsgId: string,
  newBody: string
) {
  const parsed = editWhatsappMessageSchema.safeParse({
    leadId,
    providerMsgId,
    newBody,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createClient();
  const result = await editWhatsappMessageDomain(supabase, parsed.data);
  if ("error" in result) return result;
  revalidatePath("/crm/mensagens");
  return { ok: true };
}
