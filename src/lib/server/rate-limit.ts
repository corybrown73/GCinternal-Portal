/**
 * A simple fixed-window rate limit, in memory.
 *
 * BEST-EFFORT ONLY. The counts live in this server instance's memory: each
 * serverless instance keeps its own, a cold start resets them, and two
 * instances can each allow the full budget. It stops a single holder of a
 * link from hammering one instance with reads or writes; it is not a quota
 * and must never be the only thing between a caller and something that has
 * to be enforced. A shared limit would need a store every instance sees.
 */
export type RateLimit = { limit: number; windowMs: number };

/**
 * The customer link's budgets, per token. Every open tab polls every ten
 * seconds (six reads a minute) and a page load costs two, so the read budget
 * is set well above a whole customer team on one link at a kickoff call.
 * Help-link clicks and calendar downloads have their own budget, so polling
 * tabs never spend a click's.
 */
export const WELCOME_READ_LIMIT: RateLimit = { limit: 600, windowMs: 60_000 };
export const WELCOME_CLICK_LIMIT: RateLimit = { limit: 120, windowMs: 60_000 };
export const WELCOME_WRITE_LIMIT: RateLimit = { limit: 20, windowMs: 60_000 };

/** The words a customer sees when a budget is spent. */
export const RATE_LIMITED_MESSAGE =
  "Too many requests from this link. Wait a minute and try again.";

export class RateLimitedError extends Error {
  readonly statusCode = 429;
  constructor(readonly retryAfterMs: number) {
    super(RATE_LIMITED_MESSAGE);
  }
}

const MAX_KEYS = 10_000;
const windows = new Map<string, { start: number; count: number }>();

/**
 * Count one request against `key`. True when it is within the budget, false
 * when the budget for the current window is already spent.
 */
export function takeRateLimit(key: string, rule: RateLimit, now: number = Date.now()): boolean {
  const w = windows.get(key);
  if (!w || now - w.start >= rule.windowMs) {
    if (windows.size >= MAX_KEYS) sweep(now, rule.windowMs);
    windows.set(key, { start: now, count: 1 });
    return true;
  }
  if (w.count >= rule.limit) return false;
  w.count += 1;
  return true;
}

/** The same, throwing RateLimitedError when the budget is spent. */
export function enforceRateLimit(key: string, rule: RateLimit, now: number = Date.now()): void {
  if (takeRateLimit(key, rule, now)) return;
  const w = windows.get(key);
  throw new RateLimitedError(w ? Math.max(0, w.start + rule.windowMs - now) : rule.windowMs);
}

/** Drop finished windows so the map cannot grow without bound. */
function sweep(now: number, windowMs: number): void {
  for (const [k, w] of windows) if (now - w.start >= windowMs) windows.delete(k);
  // Still full of live windows: start again rather than grow.
  if (windows.size >= MAX_KEYS) windows.clear();
}

/** Test seam. */
export function resetRateLimits(): void {
  windows.clear();
}
