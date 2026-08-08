import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scheduleJob } from "@/lib/jobs";

// Dispatcher: initializes jobs and delegates to /api/jobs/poll
// Called by pg_cron every minute with header x-cron-secret
// Ensures jobs table is populated; actual execution is in /api/jobs/poll

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function dispatch(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret");

  if (!secret || provided !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Process queue: dequeue and execute heavy tasks (media download, automations, avatar sync)
  let queueProcessed = 0;
  let queueFailed = 0;
  try {
    const queueSecret = process.env.QUEUE_WORKER_SECRET;
    if (queueSecret) {
      const host = req.headers.get("x-forwarded-host") ?? new URL(req.url).host;
      const queueUrl = `https://${host}/api/queue/process`;
      const queueRes = await fetch(queueUrl, {
        method: "GET",
        headers: { "x-queue-secret": queueSecret },
      });
      if (queueRes.ok) {
        const result = (await queueRes.json()) as {
          processed?: number;
          failed?: number;
        };
        queueProcessed = result.processed ?? 0;
        queueFailed = result.failed ?? 0;
        if (queueProcessed > 0 || queueFailed > 0) {
          console.log(
            `[cron] queue: ${queueProcessed} processed, ${queueFailed} failed`
          );
        }
      } else {
        console.log(
          "[cron] queue processing failed:",
          `HTTP ${queueRes.status}`
        );
      }
    }
  } catch (e) {
    console.log("[cron] queue processing error:", (e as Error).message);
  }

  try {
    // Initialize jobs (one-time, upsert won't duplicate)
    // These cron expressions match the old dispatch frequency
    await scheduleJob(admin, "scheduled_messages_dispatch", "* * * * *"); // every minute
    await scheduleJob(admin, "automations_run", "* * * * *"); // every minute
    await scheduleJob(admin, "sync_avatars", "*/5 * * * *"); // every 5 minutes
    await scheduleJob(admin, "sync_names", "*/5 * * * *"); // every 5 minutes
    await scheduleJob(admin, "sync_lids", "*/5 * * * *"); // every 5 minutes
    await scheduleJob(admin, "sync_contracts", "*/2 * * * *"); // every 2 minutes
    await scheduleJob(admin, "whatsapp_guardian", "* * * * *"); // every minute

    console.log("[cron] jobs initialized");

    // Delegate to job worker
    const jobSecret = process.env.JOB_SECRET;
    if (!jobSecret) {
      return NextResponse.json(
        { ok: false, error: "JOB_SECRET not configured" },
        { status: 500 }
      );
    }

    const pollUrl = new URL(req.url);
    pollUrl.pathname = "/api/jobs/poll";
    const pollReq = new Request(pollUrl, {
      method: "GET",
      headers: {
        "x-job-secret": jobSecret,
        "x-forwarded-host": req.headers.get("x-forwarded-host") || new URL(req.url).host,
      },
    });

    const response = await fetch(pollReq);
    const result = await response.json();

    return NextResponse.json({
      ok: result.ok,
      delegated: true,
      queueProcessed,
      queueFailed,
      ...result,
    });
  } catch (e) {
    console.error("[cron] initialization failed:", (e as Error).message);
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  return dispatch(req);
}

export async function GET(req: Request) {
  return dispatch(req);
}
