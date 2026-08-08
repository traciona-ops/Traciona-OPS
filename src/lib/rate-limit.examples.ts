/**
 * Rate Limiting Examples
 *
 * This file demonstrates how to use the rate limiting utilities
 * in Server Actions and other parts of the application.
 */

import {
  checkLeadLimit,
  checkMessageLimit,
  checkIntegrationLimit,
  withRateLimit,
  getRateLimitStatus,
} from "./rate-limit";

// ============================================================================
// Example 1: Using per-configured limits in Server Actions
// ============================================================================

/**
 * Server Action: Create a new lead
 * Rate limited to 10 leads per user per hour
 */
export async function createLeadAction(
  userId: string,
  leadData: { name: string; phone: string }
) {
  // Check rate limit before processing
  const limit = await checkLeadLimit(userId);

  if (!limit.allowed) {
    return {
      error: `Limit reached. Can retry after ${limit.retryAfter}s.`,
      status: 429,
      retryAfter: limit.retryAfter,
    };
  }

  // Process lead creation...
  console.log(`Lead created. ${limit.remaining} remaining this hour.`);
  return { ok: true, remaining: limit.remaining };
}

/**
 * Server Action: Send message to lead
 * Rate limited to 30 messages per lead per hour
 */
export async function sendMessageAction(
  leadId: string,
  messageBody: string
) {
  // Check rate limit before processing
  const limit = await checkMessageLimit(leadId);

  if (!limit.allowed) {
    return {
      error: `Too many messages to this lead. Try again in ${limit.retryAfter}s.`,
      status: 429,
      retryAfter: limit.retryAfter,
    };
  }

  // Process message sending...
  console.log(`Message sent. ${limit.remaining} messages remaining this hour.`);
  return { ok: true, remaining: limit.remaining };
}

/**
 * Server Action: Call external integration
 * Rate limited to 5 calls per minute
 */
export async function callIntegrationAction(
  integrationId: string,
  payload: Record<string, any>
) {
  // Check rate limit before processing
  const limit = await checkIntegrationLimit(integrationId);

  if (!limit.allowed) {
    return {
      error: `API rate limit exceeded. Retry in ${limit.retryAfter}s.`,
      status: 429,
      retryAfter: limit.retryAfter,
    };
  }

  // Process integration call...
  console.log(`Integration called. ${limit.remaining} calls remaining this minute.`);
  return { ok: true, remaining: limit.remaining };
}

// ============================================================================
// Example 2: Using withRateLimit wrapper for custom limits
// ============================================================================

/**
 * Example: Wrap an existing Server Action with rate limiting
 * Custom limit: 5 exports per user per hour
 */
async function exportDataActual(userId: string, format: string) {
  console.log(`Exporting ${format} for user ${userId}`);
  return { ok: true, url: "https://example.com/export.csv" };
}

export const exportDataAction = withRateLimit(
  exportDataActual,
  (userId) => `export:${userId}`, // key generator
  5, // limit: 5 exports
  3600000 // window: 1 hour (ms)
);

/**
 * Example: Wrap with custom key (multiple params)
 * Custom limit: 20 reports per user per organization per day
 */
async function generateReportActual(
  userId: string,
  orgId: string,
  reportType: string
) {
  console.log(`Generating ${reportType} report`);
  return { ok: true, reportId: "rpt_123" };
}

export const generateReportAction = withRateLimit(
  generateReportActual,
  (userId, orgId, reportType) => `report:${orgId}:${userId}`, // key includes both
  20, // limit: 20 reports
  86400000 // window: 1 day (ms)
);

// ============================================================================
// Example 3: Monitoring rate limit status
// ============================================================================

/**
 * Get current rate limit status for a user's lead creation
 */
export async function getUserLeadLimitStatus(userId: string) {
  const status = await getRateLimitStatus(
    `leads:${userId}`,
    10, // limit
    3600000 // 1 hour window
  );

  if (!status) {
    return { remaining: 10, resetAt: Date.now() + 3600000 };
  }

  return {
    used: status.count,
    limit: status.limit,
    remaining: status.remaining,
    resetAt: status.resetAt,
  };
}

// ============================================================================
// Example 4: Using in API Routes
// ============================================================================

/**
 * API Route handler with rate limiting
 * POST /api/send-bulk-messages
 */
export async function handleBulkMessagesAPI(
  req: Request,
  userId: string
) {
  const limit = await checkMessageLimit(userId);

  if (!limit.allowed) {
    return new Response(
      JSON.stringify({
        error: "Rate limit exceeded",
        retryAfter: limit.retryAfter,
      }),
      {
        status: 429,
        headers: {
          "Retry-After": String(limit.retryAfter),
          "Content-Type": "application/json",
        },
      }
    );
  }

  // Process messages...
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

// ============================================================================
// Usage in Components (via Server Actions)
// ============================================================================

/**
 * Example React Server Component calling a rate-limited action
 */
export async function LeadCreationFormComponent() {
  async function handleSubmit(formData: FormData) {
    "use server";

    const userId = "user_123";
    const name = formData.get("name") as string;
    const phone = formData.get("phone") as string;

    const result = await createLeadAction(userId, { name, phone });

    if ("error" in result) {
      // Show error toast with retry time
      return { error: result.error, retryAfter: result.retryAfter };
    }

    return { ok: true, remaining: result.remaining };
  }

  return (
    <form action={handleSubmit}>
      <input name="name" placeholder="Lead name" required />
      <input name="phone" placeholder="Phone" required />
      <button type="submit">Create Lead</button>
    </form>
  );
}

// ============================================================================
// Environment Setup
// ============================================================================

/**
 * Required environment variables in .env.local:
 *
 * UPSTASH_REDIS_URL=https://...redisdb...
 * UPSTASH_REDIS_TOKEN=AeyJ...
 *
 * If Redis is down, the library automatically falls back to in-memory storage.
 * This ensures graceful degradation without breaking the application.
 */
