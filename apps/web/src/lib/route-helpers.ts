/**
 * Shared cross-cutting concerns for route handlers — session enforcement,
 * CSRF check, request logging, structured error response.
 *
 * Usage:
 *   export const POST = withRoute(async ({ req, deviceId, logger }) => {
 *     const body = await readJsonBody<MyType>(req);
 *     ...
 *     return NextResponse.json({ ok: true });
 *   });
 *
 * Routes that don't need a session pass `requireSession: false`. Routes
 * that legitimately accept cross-origin requests pass `csrf: false`
 * (none currently do).
 */
import { NextResponse } from 'next/server';
import { serverEnv } from './env.js';
import { errorResponse, HttpError, requireSameOrigin } from './http.js';
import { type Logger, requestLogger } from './logger.js';
import { readDeviceId } from './session.js';

export interface RouteContext<P = unknown> {
  req: Request;
  /** Resolved when `requireSession` is true; otherwise the empty string. */
  deviceId: string;
  logger: Logger;
  /** The Next.js dynamic route params, awaited if a Promise. */
  params: P;
}

export interface RouteOptions {
  /** Default true. When true, returns 401 if no signed device cookie. */
  requireSession?: boolean;
  /** Default true. Set false for routes that legitimately need cross-origin. */
  csrf?: boolean;
}

type Handler<P> = (ctx: RouteContext<P>) => Promise<Response>;

/**
 * Next.js route handlers receive the request and an optional `{ params }`
 * context where `params` is a Promise. We mirror that signature so the
 * wrapper is a drop-in replacement; the ctx arg is optional for routes
 * without dynamic segments.
 */
type NextHandler<P> = (req: Request, ctx?: { params: Promise<P> }) => Promise<Response>;

export function withRoute<P = unknown>(
  handler: Handler<P>,
  options: RouteOptions = {},
): NextHandler<P> {
  const requireSession = options.requireSession ?? true;
  const csrfCheck = options.csrf ?? true;

  return async (req, ctx) => {
    const logger = requestLogger(req);
    try {
      if (csrfCheck) {
        requireSameOrigin(req, serverEnv().APP_URL);
      }
      let deviceId = '';
      if (requireSession) {
        const id = await readDeviceId();
        if (!id) {
          logger.warn('no session');
          return NextResponse.json({ error: 'no session' }, { status: 401 });
        }
        deviceId = id;
      }
      const params = ctx?.params ? await ctx.params : (undefined as P);
      const childLogger = deviceId ? logger.child({ deviceId }) : logger;
      const startedAt = Date.now();
      const res = await handler({ req, deviceId, logger: childLogger, params });
      childLogger.info('request handled', {
        status: res.status,
        durationMs: Date.now() - startedAt,
      });
      return res;
    } catch (err) {
      if (err instanceof HttpError) {
        logger.warn('http error', { status: err.status, body: err.body });
      }
      return errorResponse(err, logger);
    }
  };
}
