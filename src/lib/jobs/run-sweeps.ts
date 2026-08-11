import type { SupabaseClient } from "@supabase/supabase-js";
import { sweepAvatars } from "@/lib/services/whatsapp/avatar";
import { sweepNumberNames } from "@/lib/services/whatsapp/names";
import { sweepLids } from "@/lib/services/whatsapp/lids";

export type SweepsResult = {
  avatars: number;
  namesFixed: number;
  lidsLearned: number;
};

/** Avatares, nomes (PushName) e lids — estoque que o webhook não cobriu. */
export async function runSweeps(admin: SupabaseClient): Promise<SweepsResult> {
  const avatars = await sweepAvatars(admin, 8);
  const namesFixed = await sweepNumberNames(admin, 30);
  if (namesFixed > 0) console.log(`[cron] nomes corrigidos: ${namesFixed}`);
  const lidsLearned = await sweepLids(admin, 500);
  if (lidsLearned > 0) console.log(`[cron] lids aprendidos: ${lidsLearned}`);
  return { avatars, namesFixed, lidsLearned };
}
