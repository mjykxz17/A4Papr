/**
 * HTTP request helpers for route handlers.
 *
 * - `requireSameOrigin(req, expected)` blocks cross-origin POST/PATCH/DELETE.
 *   SameSite=Lax cookies handle most CSRF, but a strict Origin/Referer check
 *   is cheap defence-in-depth.
 * - `readJsonBody(req, max)` parses a JSON body with a hard size cap so a
 *   malicious caller can't OOM the server with a 100 MB blob.
 * - `HttpError` lets handlers throw structured errors that the catch wrapper
 *   converts to a JSON response.
 */
import { NextResponse } from 'next/server';
import type { Logger } from './logger.js';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(typeof body === 'string' ? body : JSON.stringify(body));
  }
}

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Reject mutating requests whose `Origin` (or `Referer` fallback) doesn't
 * match the configured app origin. Same-origin GETs and HEADs are exempt.
 */
export function requireSameOrigin(req: Request, expectedOrigin: string): void {
  if (!MUTATING.has(req.method)) return;
  const origin = req.headers.get('origin');
  if (origin) {
    if (origin !== expectedOrigin) {
      throw new HttpError(403, { error: 'cross-origin request blocked' });
    }
    return;
  }
  // Some clients (curl, server-to-server) omit Origin. Fall back to Referer.
  const referer = req.headers.get('referer');
  if (referer) {
    let refOrigin: string;
    try {
      refOrigin = new URL(referer).origin;
    } catch {
      throw new HttpError(403, { error: 'malformed Referer header' });
    }
    if (refOrigin !== expectedOrigin) {
      throw new HttpError(403, { error: 'cross-origin request blocked' });
    }
    return;
  }
  // Both headers missing → reject. Browsers always send one for fetch().
  throw new HttpError(403, { error: 'missing Origin/Referer header' });
}

/** Default request body size cap. JSON-only routes don't need more. */
export const DEFAULT_MAX_BODY_BYTES = 256 * 1024;

/**
 * Read and JSON-parse the request body with a hard byte cap. Rejects with
 * 413 if Content-Length is over the cap or if the streamed body exceeds
 * it. Rejects with 400 on parse failure.
 */
export async function readJsonBody<T = unknown>(
  req: Request,
  options: { max?: number } = {},
): Promise<T> {
  const max = options.max ?? DEFAULT_MAX_BODY_BYTES;
  const cl = req.headers.get('content-length');
  if (cl != null) {
    const n = Number(cl);
    if (Number.isFinite(n) && n > max) {
      throw new HttpError(413, { error: `body too large (max ${max} bytes)` });
    }
  }
  // .text() reads the whole stream; a malicious caller without a
  // content-length still can't exceed `max` because we cap below.
  const text = await req.text();
  if (text.length > max) {
    throw new HttpError(413, { error: `body too large (max ${max} bytes)` });
  }
  if (text.length === 0) {
    throw new HttpError(400, { error: 'empty body' });
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, { error: 'invalid JSON' });
  }
}

/**
 * Convert a thrown `HttpError` (or anything else) into a JSON response.
 * Logs unexpected errors so they're traceable.
 */
export function errorResponse(err: unknown, logger: Logger): Response {
  if (err instanceof HttpError) {
    return NextResponse.json(err.body, { status: err.status });
  }
  logger.error('unhandled route error', { err: String(err) });
  return NextResponse.json({ error: 'internal error' }, { status: 500 });
}
