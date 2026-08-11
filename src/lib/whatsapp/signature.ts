import type { SupabaseClient } from "@supabase/supabase-js";
import { SECTOR } from "@/lib/data/labels";

/**
 * Prefixo de assinatura (org_settings chat.signature):
 * "*Setor - Nome*\n\nmensagem" — asteriscos = negrito no WhatsApp.
 */
export async function applyMessageSignature(
  db: SupabaseClient,
  userId: string | null | undefined,
  text: string
): Promise<string> {
  if (!userId) return text;

  const { data: st } = await db
    .from("org_settings")
    .select("value")
    .eq("key", "chat")
    .maybeSingle();
  if (!(st?.value as { signature?: boolean } | null)?.signature) return text;

  const { data: prof } = await db
    .from("profiles")
    .select("name, sector")
    .eq("id", userId)
    .maybeSingle();
  const first = (prof?.name ?? "").split(" ")[0];
  const sectorLabel =
    SECTOR[(prof?.sector ?? "vendas") as keyof typeof SECTOR]?.label ??
    "Vendas";
  if (!first) return text;
  return `*${sectorLabel} - ${first}*\n\n${text}`;
}
