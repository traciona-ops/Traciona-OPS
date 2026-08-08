// Circuit breaker pattern: prevent cascade failures when external APIs are down.
// States: CLOSED (normal) → OPEN (reject) → HALF_OPEN (testing) → CLOSED/OPEN

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerConfig {
  failureThreshold: number; // N failures before opening
  successThreshold?: number; // successes in HALF_OPEN before closing (default 1)
  timeout: number; // ms before trying HALF_OPEN
}

interface CircuitBreakerMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  nextRetryTime: number | null;
}

const breakers = new Map<string, CircuitBreakerMetrics>();

function getMetrics(name: string): CircuitBreakerMetrics {
  if (!breakers.has(name)) {
    breakers.set(name, {
      state: "CLOSED",
      failures: 0,
      successes: 0,
      lastFailureTime: null,
      nextRetryTime: null,
    });
  }
  return breakers.get(name)!;
}

/**
 * Wraps an async function with circuit breaker pattern.
 * - Fails fast when circuit is OPEN (integration down).
 * - After timeout, tries HALF_OPEN (one request to test recovery).
 * - On success → resets to CLOSED. On failure → back to OPEN.
 */
export async function withCircuitBreaker<T>(
  name: string,
  fn: () => Promise<T>,
  failureThreshold: number = 5,
  timeout: number = 60000 // 60s cooldown before HALF_OPEN
): Promise<T> {
  const metrics = getMetrics(name);
  const now = Date.now();

  // ✓ CLOSED: normal operation
  if (metrics.state === "CLOSED") {
    try {
      const result = await fn();
      // Still good — clear any stale failure count
      metrics.failures = 0;
      return result;
    } catch (error) {
      metrics.failures++;
      metrics.lastFailureTime = now;
      // Threshold crossed → open circuit
      if (metrics.failures >= failureThreshold) {
        metrics.state = "OPEN";
        metrics.nextRetryTime = now + timeout;
        console.warn(
          `[CircuitBreaker] ${name} CLOSED → OPEN (${metrics.failures} failures). Next retry in ${timeout}ms.`
        );
      }
      throw error;
    }
  }

  // ✗ OPEN: reject fast (fail-fast)
  if (metrics.state === "OPEN") {
    // Time to try recovery?
    if (now >= (metrics.nextRetryTime || 0)) {
      metrics.state = "HALF_OPEN";
      metrics.successes = 0;
      console.warn(`[CircuitBreaker] ${name} OPEN → HALF_OPEN (testing recovery).`);
    } else {
      const waitMs = (metrics.nextRetryTime || 0) - now;
      throw new Error(
        `[CircuitBreaker] ${name} is OPEN (integration down). Retry in ${Math.ceil(waitMs / 1000)}s.`
      );
    }
  }

  // 🧪 HALF_OPEN: try one request
  if (metrics.state === "HALF_OPEN") {
    try {
      const result = await fn();
      metrics.successes++;
      // Test passed → close circuit
      metrics.state = "CLOSED";
      metrics.failures = 0;
      metrics.lastFailureTime = null;
      console.warn(`[CircuitBreaker] ${name} HALF_OPEN → CLOSED (recovered).`);
      return result;
    } catch (error) {
      // Test failed → back to open
      metrics.state = "OPEN";
      metrics.nextRetryTime = now + timeout;
      console.warn(`[CircuitBreaker] ${name} HALF_OPEN → OPEN (still failing). Next retry in ${timeout}ms.`);
      throw error;
    }
  }

  throw new Error(`[CircuitBreaker] ${name} unknown state: ${metrics.state}`);
}

/**
 * Reset circuit breaker for a specific integration (used in tests or admin actions).
 */
export function resetCircuitBreaker(name: string): void {
  breakers.delete(name);
  console.warn(`[CircuitBreaker] ${name} reset to CLOSED.`);
}

/**
 * Get current status of all circuit breakers (debug endpoint).
 */
export function getCircuitBreakerStatus(): Record<string, CircuitBreakerMetrics> {
  const status: Record<string, CircuitBreakerMetrics> = {};
  for (const [name, metrics] of breakers) {
    status[name] = { ...metrics };
  }
  return status;
}
