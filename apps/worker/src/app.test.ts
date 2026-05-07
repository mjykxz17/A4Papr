import { describe, expect, it, vi } from 'vitest';
import { createRateLimiter } from '@cheatsheet/shared';
import { createApp, type AppDeps } from './app.js';
import type { WorkerEnv } from './env.js';

const SECRET = 's'.repeat(32);

const baseEnv: WorkerEnv = {
  NODE_ENV: 'test',
  PORT: 4000,
  APP_URL: 'http://app.test',
  WORKER_SHARED_SECRET: SECRET,
  RATE_LIMIT_PER_MIN: 60,
  RENDER_TIMEOUT_MS: 5_000,
  RENDER_CONCURRENCY: 1,
  RENDER_QUEUE_DEPTH: 8,
};

function buildDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    env: baseEnv,
    renderPdf: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
    rateLimiter: createRateLimiter({
      capacity: baseEnv.RATE_LIMIT_PER_MIN,
      refillPerMinute: baseEnv.RATE_LIMIT_PER_MIN,
    }),
    ...overrides,
  };
}

function buildRequest(init: { authorization?: string; body?: unknown } = {}): Request {
  return new Request('http://worker.test/render', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(init.authorization !== undefined ? { authorization: init.authorization } : {}),
      'x-forwarded-for': '127.0.0.1',
    },
    body: JSON.stringify(init.body ?? {}),
  });
}

describe('worker /render', () => {
  it('200s on a happy path and forwards args to the renderer', async () => {
    const renderPdf = vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]));
    const app = createApp(buildDeps({ renderPdf }));
    const res = await app.fetch(
      buildRequest({
        authorization: `Bearer ${SECRET}`,
        body: {
          cheatsheetId: '11111111-1111-4111-8111-111111111111',
          deviceId: '22222222-2222-4222-8222-222222222222',
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(renderPdf).toHaveBeenCalledTimes(1);
    const arg = renderPdf.mock.calls[0]![0];
    expect(arg.cheatsheetId).toBe('11111111-1111-4111-8111-111111111111');
    expect(arg.url).toContain('/print/11111111-1111-4111-8111-111111111111');
    expect(arg.url).toContain(`key=${SECRET}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf[0]).toBe(0x25); // %PDF
  });

  it('401s when the bearer token is wrong', async () => {
    const app = createApp(buildDeps());
    const res = await app.fetch(buildRequest({ authorization: 'Bearer nope' }));
    expect(res.status).toBe(401);
  });

  it('401s when the auth header is absent', async () => {
    const app = createApp(buildDeps());
    const res = await app.fetch(buildRequest({}));
    expect(res.status).toBe(401);
  });

  it('400s on a malformed body', async () => {
    const app = createApp(buildDeps());
    const res = await app.fetch(
      buildRequest({
        authorization: `Bearer ${SECRET}`,
        body: { cheatsheetId: 'not-a-uuid', deviceId: 'also-not' },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('rate-limits beyond capacity', async () => {
    const rateLimiter = createRateLimiter({ capacity: 2, refillPerMinute: 0 });
    const app = createApp(buildDeps({ rateLimiter }));
    const validBody = {
      cheatsheetId: '11111111-1111-4111-8111-111111111111',
      deviceId: '22222222-2222-4222-8222-222222222222',
    };
    const send = () =>
      app.fetch(buildRequest({ authorization: `Bearer ${SECRET}`, body: validBody }));
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(429);
  });

  it('504s when render exceeds the timeout', async () => {
    const renderPdf = vi.fn().mockImplementation(
      () => new Promise<Uint8Array>(() => {}), // never resolves
    );
    const app = createApp(buildDeps({ renderPdf, renderTimeoutMs: 50 }));
    const res = await app.fetch(
      buildRequest({
        authorization: `Bearer ${SECRET}`,
        body: {
          cheatsheetId: '11111111-1111-4111-8111-111111111111',
          deviceId: '22222222-2222-4222-8222-222222222222',
        },
      }),
    );
    expect(res.status).toBe(504);
  });

  it('500s when the renderer throws', async () => {
    const renderPdf = vi.fn().mockRejectedValue(new Error('puppeteer crashed'));
    const app = createApp(buildDeps({ renderPdf }));
    const res = await app.fetch(
      buildRequest({
        authorization: `Bearer ${SECRET}`,
        body: {
          cheatsheetId: '11111111-1111-4111-8111-111111111111',
          deviceId: '22222222-2222-4222-8222-222222222222',
        },
      }),
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('puppeteer crashed');
  });
});

describe('worker /render concurrency', () => {
  it('503s when the queue is full', async () => {
    let release!: () => void;
    const renderPdf = vi.fn().mockImplementation(
      () =>
        new Promise<Uint8Array>((resolve) => {
          release = () => resolve(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
        }),
    );
    const { createConcurrencyLimit } = await import('./concurrency.js');
    const concurrency = createConcurrencyLimit(1, { maxQueue: 0 });
    const app = createApp(buildDeps({ renderPdf, concurrency }));
    const validBody = {
      cheatsheetId: '11111111-1111-4111-8111-111111111111',
      deviceId: '22222222-2222-4222-8222-222222222222',
    };

    // Saturate the single slot with an in-flight render.
    const inflight = app.fetch(
      buildRequest({ authorization: `Bearer ${SECRET}`, body: validBody }),
    );
    // Yield so the renderPdf invocation registers as active.
    await Promise.resolve();

    const overflow = await app.fetch(
      buildRequest({ authorization: `Bearer ${SECRET}`, body: validBody }),
    );
    expect(overflow.status).toBe(503);

    release();
    expect((await inflight).status).toBe(200);
  });
});

describe('worker /healthz', () => {
  it('returns 200 with ok', async () => {
    const app = createApp(buildDeps());
    const res = await app.fetch(new Request('http://worker.test/healthz'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
