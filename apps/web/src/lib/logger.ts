/**
 * Minimal structured JSON logger. No deps — writes one JSON object per
 * line to stdout/stderr so a log aggregator (Loki, Datadog) can index it.
 *
 * Use a request-scoped child via `requestLogger(req)` so every line
 * carries the same `requestId`, making a single user action traceable.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';
type Context = Record<string, unknown>;

function emit(level: Level, msg: string, ctx: Context): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...ctx,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  // info/debug go to stdout via direct write — `console.log` is banned
  // by the project's no-console rule (only warn/error allowed).
  else process.stdout.write(line + '\n');
}

export interface Logger {
  debug(msg: string, ctx?: Context): void;
  info(msg: string, ctx?: Context): void;
  warn(msg: string, ctx?: Context): void;
  error(msg: string, ctx?: Context): void;
  child(extra: Context): Logger;
}

export function createLogger(base: Context = {}): Logger {
  return {
    debug: (m, c) => emit('debug', m, { ...base, ...c }),
    info: (m, c) => emit('info', m, { ...base, ...c }),
    warn: (m, c) => emit('warn', m, { ...base, ...c }),
    error: (m, c) => emit('error', m, { ...base, ...c }),
    child: (extra) => createLogger({ ...base, ...extra }),
  };
}

export const REQUEST_ID_HEADER = 'x-request-id';

export const log = createLogger({ service: 'web' });

/** Build a logger scoped to a single HTTP request. */
export function requestLogger(req: Request, extra: Context = {}): Logger {
  const requestId = req.headers.get(REQUEST_ID_HEADER) ?? randomId();
  let route: string | undefined;
  try {
    route = new URL(req.url).pathname;
  } catch {
    // ignored — invalid URL on a synthetic request shouldn't kill logging
  }
  return log.child({ requestId, method: req.method, route, ...extra });
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // fallback for older runtimes (Node < 19 without webcrypto)
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

/** Test helper: capture log output by stubbing console. */
export const _internals = { emit };
