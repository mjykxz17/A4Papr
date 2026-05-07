/**
 * Worker environment configuration. Validated at boot so a misconfigured
 * deployment fails immediately instead of producing a confusing 500 on
 * the first /render call.
 */
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url().default('http://localhost:3000'),
  WORKER_SHARED_SECRET: z.string().min(16, 'WORKER_SHARED_SECRET must be at least 16 characters'),
  /** Per-IP rate limit. Defaults are conservative; tune via env in prod. */
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(20),
  /** Hard cap on a single render duration, in ms. */
  RENDER_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
});

export type WorkerEnv = z.infer<typeof EnvSchema>;

export function loadEnv(): WorkerEnv {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid worker environment:\n${issues}`);
  }
  return parsed.data;
}
