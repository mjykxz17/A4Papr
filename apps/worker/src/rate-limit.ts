/**
 * Token-bucket rate limiter, per-key (e.g. per-IP).
 *
 * Simple, deps-free, in-memory. For multi-instance worker fleets we'd
 * swap this for a Redis backend; the API stays the same.
 *
 * - `capacity`: maximum tokens (max burst).
 * - `refillPerMinute`: how many tokens are added per minute (steady state rate).
 *
 * `take()` returns `true` and decrements when a token is available;
 * `false` otherwise. Buckets that haven't been touched in
 * `idleTtlMs` are pruned on the next access so memory stays bounded.
 */

interface Bucket {
  tokens: number;
  updatedAtMs: number;
}

export interface RateLimiter {
  take(key: string): boolean;
  /** Test helper: number of live buckets (after pruning). */
  size(): number;
}

export interface RateLimiterOptions {
  capacity: number;
  refillPerMinute: number;
  idleTtlMs?: number;
  /** Override clock for tests. */
  now?: () => number;
}

export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const refillPerMs = opts.refillPerMinute / 60_000;
  const idleTtlMs = opts.idleTtlMs ?? 10 * 60_000;
  const now = opts.now ?? (() => Date.now());
  const buckets = new Map<string, Bucket>();

  function prune(t: number): void {
    if (buckets.size < 1024) return; // amortise
    for (const [k, b] of buckets) {
      if (t - b.updatedAtMs > idleTtlMs) buckets.delete(k);
    }
  }

  return {
    take(key) {
      const t = now();
      prune(t);
      const existing = buckets.get(key);
      if (!existing) {
        buckets.set(key, { tokens: opts.capacity - 1, updatedAtMs: t });
        return true;
      }
      const elapsed = t - existing.updatedAtMs;
      const refilled = Math.min(opts.capacity, existing.tokens + elapsed * refillPerMs);
      if (refilled < 1) {
        existing.tokens = refilled;
        existing.updatedAtMs = t;
        return false;
      }
      existing.tokens = refilled - 1;
      existing.updatedAtMs = t;
      return true;
    },
    size() {
      return buckets.size;
    },
  };
}
