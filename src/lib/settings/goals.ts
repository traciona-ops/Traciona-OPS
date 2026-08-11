import type { SupabaseClient } from "@supabase/supabase-js";

export async function setMonthlyGoalDomain(
  db: SupabaseClient,
  month: string,
  target: number
): Promise<{ ok: true } | { error: string }> {
  const { error } = await db
    .from("org_goals")
    .upsert({
      month,
      revenue_target: target,
      updated_at: new Date().toISOString(),
    });
  if (error) return { error: error.message };
  return { ok: true };
}
