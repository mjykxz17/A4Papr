/**
 * PDF render worker. Long-lived Hono server that holds a single
 * Puppeteer browser open and reuses it across renders. Web tier hits
 * `POST /render` with a shared secret and a cheatsheetId.
 *
 * The HTTP routing lives in `./app.ts` (testable factory).
 * This entrypoint wires real dependencies (Puppeteer, in-memory rate
 * limiter, concurrency cap, validated env) and starts the listener.
 */
import { serve } from '@hono/node-server';
import { closeBrowser, renderCheatsheetPdf } from '@cheatsheet/pdf';
import { createRateLimiter } from '@cheatsheet/shared';
import { createApp } from './app.js';
import { createConcurrencyLimit } from './concurrency.js';
import { loadEnv } from './env.js';
import { log } from './logger.js';

const env = loadEnv();

const app = createApp({
  env,
  renderPdf: ({ url }) => renderCheatsheetPdf({ url }),
  rateLimiter: createRateLimiter({
    capacity: env.RATE_LIMIT_PER_MIN,
    refillPerMinute: env.RATE_LIMIT_PER_MIN,
  }),
  concurrency: createConcurrencyLimit(env.RENDER_CONCURRENCY, {
    maxQueue: env.RENDER_QUEUE_DEPTH,
  }),
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log.info('worker listening', { port: info.port });
});

const shutdown = async (signal: string): Promise<void> => {
  log.warn('shutdown initiated', { signal });
  server.close();
  await closeBrowser();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
