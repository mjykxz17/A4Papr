/**
 * Next.js auto-runs this file once at server start (after enabling
 * `experimental.instrumentationHook` in next.config, or in Next 15
 * which has it on by default for the `instrumentation.ts` filename).
 *
 * Today this is a no-op. To wire Sentry, do:
 *
 *     // pnpm add @sentry/nextjs
 *     import * as Sentry from '@sentry/nextjs';
 *     import { setErrorReporter } from '@/lib/logger';
 *
 *     export async function register() {
 *       if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.SENTRY_DSN) {
 *         Sentry.init({
 *           dsn: process.env.SENTRY_DSN,
 *           tracesSampleRate: 0.1,
 *         });
 *         setErrorReporter((msg, ctx) => {
 *           Sentry.captureMessage(msg, { level: 'error', extra: ctx });
 *         });
 *       }
 *     }
 *
 * The reporter is invoked from `logger.error(...)`, so every server-side
 * error already routed through `withRoute` will tee to Sentry.
 */
export function register(): void {
  // Intentionally empty — see comment above.
}
