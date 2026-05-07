/**
 * Server-side environment configuration.
 *
 * All `process.env.*` access in route handlers and server components
 * goes through `serverEnv()` so missing or malformed values fail loud
 * at the boundary, with a helpful error, instead of producing a
 * confusing runtime error deeper in the stack.
 *
 * - Validation is lazy and memoised: the first call parses and caches.
 * - Optional vars (e.g. ANTHROPIC_API_KEY) become `undefined` rather
 *   than throwing — feature flags read them defensively.
 * - This module is `node`-runtime only; for edge middleware see
 *   `middleware.ts`, which validates inline (Edge can't import zod
 *   from this module without bumping bundle size unnecessarily).
 */
import { z } from 'zod';

const ServerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
  WORKER_URL: z.string().url().default('http://localhost:4000'),
  WORKER_SHARED_SECRET: z.string().min(16, 'WORKER_SHARED_SECRET must be at least 16 characters'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  /** Hard cap on a single render request to the worker, in ms. */
  WORKER_RENDER_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let _cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (_cached) return _cached;
  const parsed = ServerEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  _cached = parsed.data;
  return _cached;
}

/** Test-only helper: wipe the cache so a test can swap process.env. */
export function _resetEnvCache(): void {
  _cached = undefined;
}
