/**
 * Per-device-id rate limiter for /api/extract. Lives at module scope so
 * a single hot Next.js instance shares the bucket map across requests.
 *
 * In a horizontally scaled deployment this would need to move to Redis;
 * the function signature is the same so the swap is a one-file change.
 */
import { createRateLimiter, type RateLimiter } from '@cheatsheet/shared';

let _limiter: RateLimiter | undefined;

/**
 * Default: 5 calls per minute per device, with a burst of 5. Tunable via
 * EXTRACT_RATE_LIMIT_PER_MIN if a future operator needs to relax it.
 */
export function extractRateLimiter(): RateLimiter {
  if (_limiter) return _limiter;
  const perMin = Number(process.env.EXTRACT_RATE_LIMIT_PER_MIN ?? 5);
  _limiter = createRateLimiter({ capacity: perMin, refillPerMinute: perMin });
  return _limiter;
}

/** Test-only: drop the singleton so a fresh test can supply its own. */
export function _resetExtractLimiter(): void {
  _limiter = undefined;
}
