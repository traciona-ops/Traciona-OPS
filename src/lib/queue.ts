import { Redis } from "@upstash/redis";
import { logger } from "@/lib/logger";

// Upstash Redis FIFO queue para tasks pesadas (webhook → deferred).
// Formatos de task:
//   - reply_automations: leadId → runReplyAutomations
//   - download_media: { leadId, mediaKind, node } → downloadMedia + upload
//   - avatar_sync: leadId → ensureLeadAvatar

export type QueueTaskType = "reply_automations" | "download_media" | "avatar_sync";

export interface QueueTask {
  id: string;
  type: QueueTaskType;
  payload: Record<string, any>;
  retries: number;
  created_at: string;
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const QUEUE_KEY = "queue:tasks";
const DLQ_KEY = "queue:dlq"; // dead letter queue
const MAX_RETRIES = 3;

/**
 * Enqueue a task for async processing.
 * Returns task ID.
 */
export async function enqueue(
  type: QueueTaskType,
  payload: Record<string, any>
): Promise<string> {
  const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const task: QueueTask = {
    id: taskId,
    type,
    payload,
    retries: 0,
    created_at: new Date().toISOString(),
  };

  try {
    // Redis FIFO: LPUSH enfileira à esquerda, RPOP remove da direita (FIFO).
    await redis.lpush(QUEUE_KEY, JSON.stringify(task));
    logger.info("[QUEUE] enqueue", { taskId, type });
  } catch (err) {
    logger.error("[QUEUE] enqueue failed", {
      taskId,
      type,
      error: (err as Error).message,
    });
    throw err;
  }

  return taskId;
}

/**
 * Dequeue one task (returns null if queue is empty).
 */
export async function dequeue(): Promise<QueueTask | null> {
  try {
    const raw = await redis.rpop<string>(QUEUE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as QueueTask;
  } catch (err) {
    logger.error("[QUEUE] dequeue failed", { error: (err as Error).message });
    return null;
  }
}

/**
 * Mark task as complete (delete from any tracking if needed).
 */
export async function markDone(taskId: string): Promise<void> {
  logger.info("[QUEUE] task done", { taskId });
}

/**
 * Mark task as failed and move to DLQ or requeue.
 */
export async function markFailed(task: QueueTask, error: string): Promise<void> {
  if (task.retries < MAX_RETRIES) {
    // Re-enqueue with incremented retries
    task.retries++;
    try {
      await redis.lpush(QUEUE_KEY, JSON.stringify(task));
      logger.warn("[QUEUE] task requeued", {
        taskId: task.id,
        retries: task.retries,
        error,
      });
    } catch (err) {
      logger.error("[QUEUE] requeue failed", {
        taskId: task.id,
        error: (err as Error).message,
      });
    }
  } else {
    // Max retries exceeded → DLQ
    try {
      await redis.lpush(DLQ_KEY, JSON.stringify({ ...task, error, failed_at: new Date().toISOString() }));
      logger.error("[QUEUE] task to DLQ", {
        taskId: task.id,
        retries: task.retries,
        error,
      });
    } catch (err) {
      logger.error("[QUEUE] dlq push failed", {
        taskId: task.id,
        error: (err as Error).message,
      });
    }
  }
}

/**
 * Get queue stats (for monitoring).
 */
export async function getQueueStats(): Promise<{
  pending: number;
  dlq: number;
}> {
  try {
    const pending = await redis.llen(QUEUE_KEY);
    const dlq = await redis.llen(DLQ_KEY);
    return { pending, dlq };
  } catch (err) {
    logger.error("[QUEUE] stats failed", { error: (err as Error).message });
    return { pending: -1, dlq: -1 };
  }
}
