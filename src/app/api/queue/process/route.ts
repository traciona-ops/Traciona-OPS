import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dequeue, markDone, markFailed, type QueueTask } from "@/lib/queue";
import { runReplyAutomations } from "@/lib/automations/engine";
import { downloadMedia } from "@/lib/whatsapp/dinastia";
import { ensureLeadAvatar, type AvatarLead } from "@/lib/whatsapp/avatar";
import { logger } from "@/lib/logger";

const MAX_BATCH_SIZE = 10; // max tasks to process per call
const HANDLER_TIMEOUT_MS = 30_000; // 30s per task

/**
 * Handler para reply_automations: executa automações de resposta para o lead.
 */
async function handleReplyAutomations(
  admin: ReturnType<typeof createAdminClient>,
  payload: Record<string, any>
): Promise<void> {
  const leadId = payload.leadId as string;
  if (!leadId) throw new Error("Missing leadId");
  await runReplyAutomations(admin, leadId);
}

/**
 * Handler para download_media: baixa mídia do WhatsApp e faz upload pro Storage.
 */
async function handleDownloadMedia(
  admin: ReturnType<typeof createAdminClient>,
  payload: Record<string, any>
): Promise<void> {
  const leadId = payload.leadId as string;
  const mediaKind = payload.mediaKind as
    | "image"
    | "audio"
    | "video"
    | "document"
    | undefined;
  const node = payload.node as Record<string, any>;

  if (!leadId || !mediaKind || !node) {
    throw new Error("Missing leadId, mediaKind, or node");
  }

  const dl = await downloadMedia(mediaKind, node);
  if (!dl) {
    logger.warn("[QUEUE/download_media] download failed", { leadId, mediaKind });
    return;
  }

  // Upload pro Storage
  const ext = (dl.mime.split("/")[1] || "bin").split(";")[0];
  const dir = payload.direction || "in";
  const path = `${leadId}/${dir}-${Date.now()}.${ext}`;

  const { error: upErr } = await admin.storage
    .from("whatsapp-media")
    .upload(path, dl.buffer, { contentType: dl.mime });

  if (upErr) {
    logger.error("[QUEUE/download_media] upload failed", {
      leadId,
      path,
      error: upErr.message,
    });
    throw upErr;
  }

  // Retorna a URL pública (não usa, mas confirma sucesso)
  const publicUrl = admin.storage
    .from("whatsapp-media")
    .getPublicUrl(path).data.publicUrl;
  logger.info("[QUEUE/download_media] uploaded", { leadId, path, url: publicUrl });
}

/**
 * Handler para avatar_sync: atualiza foto de perfil do lead.
 */
async function handleAvatarSync(
  admin: ReturnType<typeof createAdminClient>,
  payload: Record<string, any>
): Promise<void> {
  const leadId = payload.leadId as string;
  if (!leadId) throw new Error("Missing leadId");

  const { data: avLead } = await admin
    .from("leads")
    .select("id, phone, avatar_url, avatar_id, avatar_checked_at")
    .eq("id", leadId)
    .maybeSingle();

  if (!avLead) {
    logger.warn("[QUEUE/avatar_sync] lead not found", { leadId });
    return;
  }

  await ensureLeadAvatar(admin, avLead as AvatarLead);
  logger.info("[QUEUE/avatar_sync] completed", { leadId });
}

/**
 * Processa uma task. Retorna true se sucesso, false se falha.
 */
async function processTask(
  admin: ReturnType<typeof createAdminClient>,
  task: QueueTask
): Promise<boolean> {
  try {
    // Execute com timeout
    const abortCtrl = new AbortController();
    const timeoutId = setTimeout(() => abortCtrl.abort(), HANDLER_TIMEOUT_MS);

    try {
      switch (task.type) {
        case "reply_automations":
          await handleReplyAutomations(admin, task.payload);
          break;
        case "download_media":
          await handleDownloadMedia(admin, task.payload);
          break;
        case "avatar_sync":
          await handleAvatarSync(admin, task.payload);
          break;
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }
      clearTimeout(timeoutId);
      return true;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("[QUEUE/processTask] failed", {
      taskId: task.id,
      type: task.type,
      retries: task.retries,
      error: errorMsg,
    });
    return false;
  }
}

/**
 * GET /api/queue/process — worker endpoint (called by cron every 10s).
 * Autenticado via x-queue-secret header.
 * Processa até MAX_BATCH_SIZE tasks.
 */
export async function GET(req: Request) {
  const startTime = Date.now();
  const secret = process.env.QUEUE_WORKER_SECRET;
  const provided = req.headers.get("x-queue-secret");

  // Fail-closed
  if (!secret || provided !== secret) {
    logger.warn("[QUEUE/GET] auth failed", { provided: !!provided });
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  let processed = 0;
  let failed = 0;

  try {
    // Processa até MAX_BATCH_SIZE tasks
    for (let i = 0; i < MAX_BATCH_SIZE; i++) {
      const task = await dequeue();
      if (!task) break; // fila vazia

      const success = await processTask(admin, task);
      if (success) {
        await markDone(task.id);
        processed++;
      } else {
        await markFailed(task, "handler failed");
        failed++;
      }
    }

    const durationMs = Date.now() - startTime;
    logger.info("[QUEUE/GET] batch complete", {
      processed,
      failed,
      durationMs,
    });

    return NextResponse.json({
      ok: true,
      processed,
      failed,
      durationMs,
    });
  } catch (err) {
    logger.error("[QUEUE/GET] batch failed", {
      error: (err as Error).message,
      durationMs: Date.now() - startTime,
    });
    return NextResponse.json(
      { ok: false, error: "batch processing failed" },
      { status: 500 }
    );
  }
}
