/**
 * Test helpers for Next.js route handler tests.
 *
 * The handlers depend on `next/headers` cookies and `@cheatsheet/db`'s
 * `getDb()`. Both are mocked via `vi.mock` in each test file — this
 * module provides the shared mock builders so we don't reinvent them.
 *
 * Drizzle's query builder is *deeply* chainable. Rather than build a
 * universal fake, each test pre-programs the responses it expects via
 * `mockSelect`, `mockInsert`, etc., and asserts on the captured calls.
 */
import { vi } from 'vitest';

const SESSION_SECRET_FOR_TESTS = 'a'.repeat(32);

export function setUpEnv(extra: Record<string, string> = {}): void {
  process.env.SESSION_SECRET = SESSION_SECRET_FOR_TESTS;
  process.env.WORKER_SHARED_SECRET = 'b'.repeat(32);
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.WORKER_URL = 'http://worker.test';
  process.env.APP_URL = 'http://app.test';
  for (const [k, v] of Object.entries(extra)) process.env[k] = v;
}

/** Build a chainable fake that returns `result` when awaited or iterated. */
export function thenable<T>(result: T): {
  promise: Promise<T>;
  builder: ChainableBuilder<T>;
  calls: { method: string; args: unknown[] }[];
} {
  const calls: { method: string; args: unknown[] }[] = [];
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      // promise interop
      if (prop === 'then') {
        return (resolve: (v: T) => void, reject?: (e: unknown) => void) => {
          try {
            resolve(result);
          } catch (err) {
            reject?.(err);
          }
        };
      }
      if (prop === 'catch' || prop === 'finally' || prop === Symbol.toPrimitive) {
        return undefined;
      }
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args });
        return builder;
      };
    },
  };
  const builder = new Proxy({}, handler) as ChainableBuilder<T>;
  return { promise: Promise.resolve(result), builder, calls };
}

export type ChainableBuilder<_T> = {
  [k: string]: (...args: unknown[]) => ChainableBuilder<unknown>;
};

/** Create a `cookies()` mock returning a fixed device cookie. */
export async function mockCookies({ deviceId }: { deviceId: string | null }): Promise<unknown> {
  // deviceId === null means no cookie present.
  if (deviceId === null) {
    return { get: vi.fn().mockReturnValue(undefined) };
  }
  // sign the cookie the way session.ts expects.
  const { createHmac } = await import('node:crypto');
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? SESSION_SECRET_FOR_TESTS;
  const mac = createHmac('sha256', process.env.SESSION_SECRET).update(deviceId).digest('base64url');
  const value = `${deviceId}.${mac}`;
  return {
    get: vi.fn((name: string) => (name === 'cs_device' ? { value } : undefined)),
  };
}

export const TEST_DEVICE_ID = '11111111-1111-4111-8111-111111111111';
export const TEST_BLOCK_ID = '22222222-2222-4222-8222-222222222222';
export const TEST_CHEATSHEET_ID = '33333333-3333-4333-8333-333333333333';
export const TEST_PLACEMENT_ID = '44444444-4444-4444-8444-444444444444';
