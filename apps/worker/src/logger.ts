/**
 * Worker-side structured JSON logger. Mirror of `apps/web/src/lib/logger.ts`
 * — kept duplicated so neither app pulls a workspace package just for logs.
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
  // info/debug → stdout direct (no-console rule disallows console.log).
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

export const log = createLogger({ service: 'worker' });

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

export function requestLogger(req: Request, extra: Context = {}): Logger {
  const requestId = req.headers.get(REQUEST_ID_HEADER) ?? randomId();
  let route: string | undefined;
  try {
    route = new URL(req.url).pathname;
  } catch {
    // ignored
  }
  return log.child({ requestId, method: req.method, route, ...extra });
}
