import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runTimeAutomations } from "@/lib/automations/engine";
import {
  dispatchScheduledMessages,
  runGuardian,
  runSweeps,
} from "@/lib/jobs";
import { syncPendingContractSignatures } from "@/lib/contratos/sync-signature";

// Orquestra o tick do pg_cron. Lógica em lib/jobs/* — valida secret e isola etapas.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function settled<T>(r: PromiseSettledResult<T>, label: string, fallback: T): T {
  if (r.status === "fulfilled") return r.value;
  console.log(`[cron] ${label}:`, (r.reason as Error)?.message ?? r.reason);
  return fallback;
}

async function dispatch(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const host =
    req.headers.get("x-forwarded-host") ?? new URL(req.url).host;

  const scheduled = await dispatchScheduledMessages(admin).catch((e) => {
    console.log("[cron] agendadas falharam:", (e as Error).message);
    return { processed: 0, sent: 0, failed: 0 };
  });

  const [autoR, sweepsR, contractsR, guardianR] = await Promise.allSettled([
    runTimeAutomations(admin),
    runSweeps(admin),
    syncPendingContractSignatures(admin, 3),
    runGuardian(admin, { host }),
  ]);

  const sweeps = settled(sweepsR, "sweeps falharam", {
    avatars: 0,
    namesFixed: 0,
    lidsLearned: 0,
  });
  const guardian = settled(guardianR, "guardião WhatsApp falhou", {
    waOnline: null as boolean | null,
    webhookFixed: false,
  });

  return NextResponse.json({
    ok: true,
    processed: scheduled.processed,
    sent: scheduled.sent,
    failed: scheduled.failed,
    automated: settled(autoR, "automações falharam", 0),
    avatars: sweeps.avatars,
    namesFixed: sweeps.namesFixed,
    lidsLearned: sweeps.lidsLearned,
    contractsSynced: settled(contractsR, "sync de contratos falhou", 0),
    waOnline: guardian.waOnline,
    webhookFixed: guardian.webhookFixed,
  });
}

export async function POST(req: Request) {
  return dispatch(req);
}

export async function GET(req: Request) {
  return dispatch(req);
}
