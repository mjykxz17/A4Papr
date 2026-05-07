/**
 * Worker HTTP app, factored out of the entrypoint so it can be tested
 * with stubbed renderers and stubbed clocks.
 *
 *   const app = createApp({ env, renderPdf, rateLimiter });
 *   const res = await app.fetch(new Request('http://test/render', ...));
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { WorkerEnv } from './env.js';
import type { RateLimiter } from './rate-limit.js';

export interface RenderArgs {
  cheatsheetId: string;
  deviceId: string;
}

export interface AppDeps {
  env: WorkerEnv;
  /**
   * Render a cheatsheet to a PDF buffer. The default implementation
   * uses Puppeteer; tests inject a stub.
   */
  renderPdf: (args: RenderArgs & { url: string }) => Promise<Uint8Array>;
  /** Per-IP rate limiter. */
  rateLimiter: RateLimiter;
  /**
   * Hard cap on render duration. The default uses `env.RENDER_TIMEOUT_MS`
   * but tests can override.
   */
  renderTimeoutMs?: number;
}

const RenderInput = z.object({
  cheatsheetId: z.string().uuid(),
  deviceId: z.string().uuid(),
});

/** Run `promise` against a hard timeout. Throws if it doesn't settle in time. */
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const renderTimeoutMs = deps.renderTimeoutMs ?? deps.env.RENDER_TIMEOUT_MS;

  app.get('/healthz', (c) => c.json({ ok: true }));

  app.post('/render', async (c) => {
    // 1. Auth: shared secret in Authorization header.
    const auth = c.req.header('authorization') ?? '';
    if (auth !== `Bearer ${deps.env.WORKER_SHARED_SECRET}`) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    // 2. Rate limit per source IP (or 'unknown' if missing).
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      c.req.header('x-real-ip') ??
      'unknown';
    if (!deps.rateLimiter.take(ip)) {
      return c.json({ error: 'rate limit exceeded' }, 429);
    }

    // 3. Validate body.
    const body = await c.req.json().catch(() => null);
    const parsed = RenderInput.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    // 4. Build the print URL with the shared secret embedded so the
    // print page accepts the request server-side.
    const url = new URL(`/print/${parsed.data.cheatsheetId}`, deps.env.APP_URL);
    url.searchParams.set('device', parsed.data.deviceId);
    url.searchParams.set('key', deps.env.WORKER_SHARED_SECRET);

    // 5. Render with a hard timeout — a stuck Puppeteer page would
    // otherwise pin a worker until OOM.
    try {
      const pdf = await withTimeout(
        deps.renderPdf({
          cheatsheetId: parsed.data.cheatsheetId,
          deviceId: parsed.data.deviceId,
          url: url.toString(),
        }),
        renderTimeoutMs,
        'render',
      );
      return new Response(pdf, {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'content-length': String(pdf.byteLength),
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'render failed';
      // Differentiate timeout (504) vs other render failures (500) so
      // the web tier can surface a useful message.
      const status = msg.includes('timed out') ? 504 : 500;
      console.error('render failed', err);
      return c.json({ error: msg }, status);
    }
  });

  return app;
}
