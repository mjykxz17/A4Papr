import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rate-limit.js';

describe('rate limiter', () => {
  it('allows up to capacity in a burst, then denies', () => {
    const now = 1_000_000;
    const rl = createRateLimiter({ capacity: 3, refillPerMinute: 0, now: () => now });
    expect(rl.take('ip')).toBe(true);
    expect(rl.take('ip')).toBe(true);
    expect(rl.take('ip')).toBe(true);
    expect(rl.take('ip')).toBe(false);
  });

  it('refills tokens over time', () => {
    let now = 1_000_000;
    const rl = createRateLimiter({ capacity: 1, refillPerMinute: 60, now: () => now });
    expect(rl.take('ip')).toBe(true);
    expect(rl.take('ip')).toBe(false);
    // 60/min = 1/sec → wait 1.1s
    now += 1_100;
    expect(rl.take('ip')).toBe(true);
  });

  it('keeps separate buckets per key', () => {
    const now = 1_000_000;
    const rl = createRateLimiter({ capacity: 1, refillPerMinute: 0, now: () => now });
    expect(rl.take('a')).toBe(true);
    expect(rl.take('b')).toBe(true);
    expect(rl.take('a')).toBe(false);
    expect(rl.take('b')).toBe(false);
  });
});
