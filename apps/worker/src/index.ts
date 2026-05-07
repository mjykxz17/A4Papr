/**
 * PDF render worker. Long-lived Hono server that holds a single
 * Puppeteer browser open and reuses it across renders. Web tier hits
 * `POST /render` with a shared secret and a cheatsheetId.
 *
 * The HTTP routing lives in `./app.ts` (testable factory).
 * This entrypoint wires real dependencies (Puppeteer, in-memory rate
 * limiter, validated env) and starts the listener.
 */
import { serve } from '@hono/node-server';
import { closeBrowser, renderCheatsheetPdf } from '@cheatsheet/pdf';
import { createApp } from './app.js';
import { loadEnv } from './env.js';
import { createRateLimiter } from './rate-limit.js';

const env = loadEnv();

const app = createApp({
  env,
  renderPdf: ({ url }) => renderCheatsheetPdf({ url }),
  rateLimiter: createRateLimiter({
    capacity: env.RATE_LIMIT_PER_MIN,
    refillPerMinute: env.RATE_LIMIT_PER_MIN,
  }),
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.warn(`worker listening on http://localhost:${info.port}`);
});

const shutdown = async (signal: string): Promise<void> => {
  console.warn(`${signal} received, shutting down`);
  server.close();
  await closeBrowser();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
