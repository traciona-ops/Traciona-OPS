import { SupabaseClient } from "@supabase/supabase-js";

export type JobHandler = (
  admin: SupabaseClient
) => Promise<{ success: boolean; message?: string }>;

// Parse cron expression and calculate next run time.
// Supports: "0/5 * * * *" (every 5 min), "0 * * * *" (hourly)
// Format: minute hour day month weekday
function getNextRunTime(cronExpr: string, fromDate = new Date()): Date {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron format: ${cronExpr}`);
  }

  const [minPart, hourPart, dayPart, monthPart, dowPart] = parts;

  // Parse minute
  const minutes = parseCronPart(minPart, 0, 59);
  const hours = parseCronPart(hourPart, 0, 23);
  const days = parseCronPart(dayPart, 1, 31);
  const months = parseCronPart(monthPart, 1, 12);
  const dows = parseCronPart(dowPart, 0, 6);

  let current = new Date(fromDate);
  current.setSeconds(0);
  current.setMilliseconds(0);
  current.setMinutes(current.getMinutes() + 1); // Start checking from next minute

  // Search up to 1 year ahead
  const limit = new Date(fromDate);
  limit.setFullYear(limit.getFullYear() + 1);

  while (current < limit) {
    const m = current.getMinutes();
    const h = current.getHours();
    const d = current.getDate();
    const mon = current.getMonth() + 1;
    const dow = current.getDay();

    const matchMin = minutes.includes(m);
    const matchHour = hours.includes(h);
    const matchDay = days.includes(d);
    const matchMonth = months.includes(mon);
    const matchDow = dows.includes(dow);

    // Day and dow are OR'd if dow is specified (not *)
    const dayMatch =
      dowPart === "*" ? matchDay && matchMonth : (matchDay || matchDow) && matchMonth;

    if (matchMin && matchHour && dayMatch) {
      return current;
    }

    current.setMinutes(current.getMinutes() + 1);
  }

  throw new Error(`No valid cron match found within 1 year: ${cronExpr}`);
}

function parseCronPart(part: string, min: number, max: number): number[] {
  if (part === "*") {
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }

  if (part.startsWith("*/")) {
    const step = parseInt(part.slice(2), 10);
    const result = [];
    for (let i = min; i <= max; i += step) {
      result.push(i);
    }
    return result;
  }

  if (part.includes(",")) {
    return part.split(",").flatMap((p) => parseCronPart(p.trim(), min, max));
  }

  if (part.includes("-")) {
    const [start, end] = part.split("-").map((s) => parseInt(s, 10));
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  const val = parseInt(part, 10);
  if (isNaN(val) || val < min || val > max) {
    throw new Error(`Invalid cron value: ${part} (range: ${min}-${max})`);
  }
  return [val];
}

/**
 * Schedule a job to run at intervals defined by cron expression.
 * Stores in DB; worker polls and executes.
 */
export async function scheduleJob(
  admin: SupabaseClient,
  name: string,
  cron: string,
  handler?: JobHandler
): Promise<{ id: string }> {
  // Validate cron expression
  const nextRun = getNextRunTime(cron);

  // Upsert job (if exists, update next_run_at)
  const { data, error } = await admin
    .from("jobs")
    .upsert(
      {
        name,
        cron,
        next_run_at: nextRun.toISOString(),
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "name" }
    )
    .select("id")
    .single();

  if (error) throw error;
  return { id: data.id };
}

/**
 * Get due jobs and run them. Returns count of jobs run.
 * Used by /api/jobs/poll worker.
 */
export async function processDueJobs(
  admin: SupabaseClient,
  handlers: Record<string, JobHandler>
): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ name: string; error: string }>;
}> {
  const now = new Date();
  const nowISO = now.toISOString();

  // Claim due jobs atomically
  const { data: claimed, error: claimError } = await admin
    .from("jobs")
    .update({
      status: "active", // Keep as active during run
      last_run_at: nowISO,
    })
    .eq("status", "active")
    .lte("next_run_at", nowISO)
    .select("id, name, cron, payload");

  if (claimError) throw claimError;

  const jobs = (claimed ?? []) as Array<{
    id: string;
    name: string;
    cron: string;
    payload?: unknown;
  }>;

  let succeeded = 0;
  let failed = 0;
  const errors: Array<{ name: string; error: string }> = [];

  for (const job of jobs) {
    const handler = handlers[job.name];
    if (!handler) {
      errors.push({
        name: job.name,
        error: `No handler registered for job: ${job.name}`,
      });
      failed++;
      continue;
    }

    const startedAt = new Date();
    try {
      const result = await handler(admin);
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();

      // Calculate next run time
      const nextRun = getNextRunTime(job.cron, completedAt);

      // Log success
      await admin.from("job_runs").insert({
        job_id: job.id,
        started_at: startedAt.toISOString(),
        completed_at: completedAt.toISOString(),
        duration_ms: durationMs,
        status: "success",
        result: { message: result.message || "OK" },
      });

      // Update job with next run time
      await admin
        .from("jobs")
        .update({
          next_run_at: nextRun.toISOString(),
          error_message: null,
          status: "active",
        })
        .eq("id", job.id);

      succeeded++;
      console.log(
        `[jobs] ${job.name} succeeded (${durationMs}ms, next: ${nextRun.toISOString()})`
      );
    } catch (e) {
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();
      const errorMsg = (e as Error).message || String(e);

      // Log failure
      await admin.from("job_runs").insert({
        job_id: job.id,
        started_at: startedAt.toISOString(),
        completed_at: completedAt.toISOString(),
        duration_ms: durationMs,
        status: "failed",
        error: errorMsg,
      });

      // Update job with error
      await admin
        .from("jobs")
        .update({
          error_message: errorMsg.slice(0, 500),
          status: "error",
        })
        .eq("id", job.id);

      failed++;
      errors.push({ name: job.name, error: errorMsg });
      console.error(`[jobs] ${job.name} failed: ${errorMsg}`);
    }
  }

  return {
    processed: jobs.length,
    succeeded,
    failed,
    errors,
  };
}
