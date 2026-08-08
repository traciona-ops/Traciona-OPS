/**
 * Structured JSON logger for Vercel (captured via stdout).
 * Format: {ts, level, msg, ...meta}
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export function log(
  level: LogLevel,
  msg: string,
  meta?: Record<string, unknown>
): void {
  const ts = new Date().toISOString();
  console.log(JSON.stringify({ ts, level, msg, ...meta }));
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) =>
    log("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) =>
    log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) =>
    log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) =>
    log("error", msg, meta),
};
