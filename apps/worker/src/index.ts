/**
 * PDF render worker. Long-lived Hono server that holds a single
 * Puppeteer browser open and reuses it across renders. Web tier hits
 * `POST /render` with a shared secret and a cheatsheetId.
 */
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { z } from 'zod';
import { closeBrowser, renderCheatsheetPdf } from '@cheatsheet/pdf';

const PORT = Number(process.env.PORT ?? 4000);
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';
const SHARED_SECRET = process.env.WORKER_SHARED_SECRET;

if (!SHARED_SECRET) {
  console.error('WORKER_SHARED_SECRET is required');
  process.exit(1);
}

const RenderInput = z.object({
  cheatsheetId: z.string().uuid(),
  deviceId: z.string().uuid(),
});

const app = new Hono();

app.get('/healthz', (c) => c.json({ ok: true }));

app.post('/render', async (c) => {
  const auth = c.req.header('authorization') ?? '';
  if (auth !== `Bearer ${SHARED_SECRET}`) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  const body = await c.req.json().catch(() => null);
  const parsed = RenderInput.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const url = new URL(`/print/${parsed.data.cheatsheetId}`, APP_URL);
  url.searchParams.set('device', parsed.data.deviceId);
  url.searchParams.set('key', SHARED_SECRET);

  try {
    const pdf = await renderCheatsheetPdf({ url: url.toString() });
    return new Response(pdf, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(pdf.byteLength),
      },
    });
  } catch (err) {
    console.error('render failed', err);
    return c.json(
      { error: err instanceof Error ? err.message : 'render failed' },
      500,
    );
  }
});

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.warn(`worker listening on http://localhost:${info.port}`);
});

const shutdown = async (signal: string) => {
  console.warn(`${signal} received, shutting down`);
  server.close();
  await closeBrowser();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
