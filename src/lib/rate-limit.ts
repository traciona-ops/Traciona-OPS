import { Redis } from "@upstash/redis";

// === Upstash Redis Client ===
const redis = process.env.UPSTASH_REDIS_URL
  ? new Redis({
      url: process.env.UPSTASH_REDIS_URL,
      token: process.env.UPSTASH_REDIS_TOKEN,
    })
  : null;

// === In-Memory Fallback ===
const memoryStore = new Map<string, { count: number; resetAt: number }>();

// === Sliding Window Rate Limiter ===
interface RateLimitConfig {
  key: string;
  limit: number;
  window: number; // milliseconds
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

async function checkRateLimit(
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - config.window;

  if (redis) {
    try {
      // Sliding window via sorted set in Redis
      // Score = timestamp, member = unique request ID (we use timestamp ms precision)
      const sortedKey = `rl:${config.key}`;

      // Remove entries outside the window
      await redis.zremrangebyscore(sortedKey, "-inf", windowStart);

      // Count requests in current window
      const count = await redis.zcard(sortedKey);

      if (count >= config.limit) {
        // Exceeded limit; get oldest entry to calculate retry-after
        const oldest = await redis.zrange<number[]>(sortedKey, 0, 0, {
          withscores: true,
        });
        const oldestTimestamp = oldest.length > 0 ? oldest[1] : now;
        const retryAfter = Math.ceil((oldestTimestamp + config.window - now) / 1000);

        return {
          allowed: false,
          remaining: 0,
          resetAt: oldestTimestamp + config.window,
          retryAfter: Math.max(1, retryAfter),
        };
      }

      // Add current request
      const requestId = `${now}-${Math.random().toString(36).substring(9)}`;
      await redis.zadd(sortedKey, { score: now, member: requestId });

      // Set expiry to window duration + 1s for cleanup
      await redis.expire(sortedKey, Math.ceil(config.window / 1000) + 1);

      return {
        allowed: true,
        remaining: config.limit - count - 1,
        resetAt: now + config.window,
      };
    } catch (error) {
      console.warn(
        "[RateLimit] Redis error, falling back to in-memory:",
        (error as Error).message
      );
      // Fall through to memory store
    }
  }

  // === In-Memory Fallback ===
  const entry = memoryStore.get(config.key);

  if (!entry || entry.resetAt <= now) {
    // Window expired or new entry
    const requestId = `${now}-${Math.random().toString(36).substring(9)}`;
    memoryStore.set(config.key, {
      count: 1,
      resetAt: now + config.window,
    });

    return {
      allowed: true,
      remaining: config.limit - 1,
      resetAt: now + config.window,
    };
  }

  // Still within window
  if (entry.count >= config.limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfter: Math.max(1, retryAfter),
    };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: config.limit - entry.count,
    resetAt: entry.resetAt,
  };
}

// === Pre-configured Limits ===
const LIMITS = {
  /** 10 leads per user per hour */
  leads: { limit: 10, window: 3600000 } as const,
  /** 30 messages per lead per hour */
  messages: { limit: 30, window: 3600000 } as const,
  /** 5 integration calls per minute */
  integrations: { limit: 5, window: 60000 } as const,
} as const;

/**
 * Check rate limit for lead creation (10 per hour per user)
 */
export async function checkLeadLimit(userId: string): Promise<RateLimitResult> {
  return checkRateLimit({
    key: `leads:${userId}`,
    ...LIMITS.leads,
  });
}

/**
 * Check rate limit for messages to a lead (30 per hour per lead)
 */
export async function checkMessageLimit(
  leadId: string
): Promise<RateLimitResult> {
  return checkRateLimit({
    key: `messages:${leadId}`,
    ...LIMITS.messages,
  });
}

/**
 * Check rate limit for integration calls (5 per minute)
 */
export async function checkIntegrationLimit(
  integrationId: string
): Promise<RateLimitResult> {
  return checkRateLimit({
    key: `integrations:${integrationId}`,
    ...LIMITS.integrations,
  });
}

/**
 * Webhook middleware: check sender phone to rate limit by phone number
 * (prevents spam from one number)
 */
export async function checkWebhookPhoneLimit(
  phone: string
): Promise<RateLimitResult> {
  return checkRateLimit({
    key: `webhook:phone:${phone}`,
    limit: 100, // 100 messages per phone per minute as a spam check
    window: 60000,
  });
}

/**
 * Server Action wrapper with automatic rate limit checking
 */
export function withRateLimit<T extends any[], R>(
  action: (...args: T) => Promise<R>,
  keyGenerator: (...args: T) => string,
  limit: number,
  window: number
) {
  return async (...args: T): Promise<R | { error: string; status: 429 }> => {
    const key = keyGenerator(...args);
    const result = await checkRateLimit({ key, limit, window });

    if (!result.allowed) {
      return {
        error: `Rate limit exceeded. Retry after ${result.retryAfter}s`,
        status: 429,
      };
    }

    return action(...args);
  };
}

/**
 * Reset rate limit counter (for admin/testing)
 */
export async function resetRateLimit(key: string): Promise<void> {
  if (redis) {
    try {
      await redis.del(`rl:${key}`);
      return;
    } catch (error) {
      console.warn("[RateLimit] Redis reset error:", (error as Error).message);
    }
  }
  memoryStore.delete(key);
}

/**
 * Get current rate limit status (for monitoring)
 */
export async function getRateLimitStatus(
  key: string,
  limit: number,
  window: number
): Promise<{ count: number; limit: number; remaining: number; resetAt: number } | null> {
  const now = Date.now();
  const windowStart = now - window;

  if (redis) {
    try {
      const sortedKey = `rl:${key}`;
      await redis.zremrangebyscore(sortedKey, "-inf", windowStart);
      const count = await redis.zcard(sortedKey);
      return {
        count,
        limit,
        remaining: Math.max(0, limit - count),
        resetAt: now + window,
      };
    } catch (error) {
      console.warn("[RateLimit] Redis status error:", (error as Error).message);
    }
  }

  const entry = memoryStore.get(key);
  if (!entry || entry.resetAt <= now) {
    return {
      count: 0,
      limit,
      remaining: limit,
      resetAt: now + window,
    };
  }

  return {
    count: entry.count,
    limit,
    remaining: Math.max(0, limit - entry.count),
    resetAt: entry.resetAt,
  };
}
