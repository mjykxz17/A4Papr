import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger, REQUEST_ID_HEADER, requestLogger } from './logger.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function captureConsole(): { lines: { stream: string; line: string }[] } {
  const out: { stream: string; line: string }[] = [];
  // info/debug write to process.stdout (no-console rule disallows console.log).
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
    out.push({ stream: 'stdout', line: String(chunk).trim() });
    return true;
  }) as typeof process.stdout.write);
  vi.spyOn(console, 'warn').mockImplementation((...args) => {
    out.push({ stream: 'warn', line: String(args[0]) });
  });
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    out.push({ stream: 'error', line: String(args[0]) });
  });
  return { lines: out };
}

describe('createLogger', () => {
  it('emits one JSON line per call to the right stream', () => {
    const cap = captureConsole();
    const log = createLogger({ service: 'unit' });
    log.info('hello', { user: 'a' });
    log.warn('warn');
    log.error('error');
    expect(cap.lines).toHaveLength(3);
    const info = JSON.parse(cap.lines[0]!.line) as Record<string, unknown>;
    expect(info.level).toBe('info');
    expect(info.service).toBe('unit');
    expect(info.user).toBe('a');
    expect(info.msg).toBe('hello');
    expect(typeof info.ts).toBe('string');
    expect(cap.lines[0]!.stream).toBe('stdout');
    expect(cap.lines[1]!.stream).toBe('warn');
    expect(cap.lines[2]!.stream).toBe('error');
  });

  it('child() merges base context', () => {
    const cap = captureConsole();
    const log = createLogger({ service: 'svc' }).child({ requestId: 'r1' });
    log.info('hi');
    const parsed = JSON.parse(cap.lines[0]!.line) as Record<string, unknown>;
    expect(parsed.service).toBe('svc');
    expect(parsed.requestId).toBe('r1');
  });
});

describe('requestLogger', () => {
  it('uses the x-request-id header if present', () => {
    const cap = captureConsole();
    const req = new Request('http://x.test/api/foo', {
      method: 'POST',
      headers: { [REQUEST_ID_HEADER]: 'abc-123' },
    });
    const log = requestLogger(req);
    log.info('hi');
    const parsed = JSON.parse(cap.lines[0]!.line) as Record<string, unknown>;
    expect(parsed.requestId).toBe('abc-123');
    expect(parsed.method).toBe('POST');
    expect(parsed.route).toBe('/api/foo');
  });

  it('mints a fresh requestId if no header', () => {
    const cap = captureConsole();
    const req = new Request('http://x.test/api/y', { method: 'GET' });
    const log = requestLogger(req);
    log.info('hi');
    const parsed = JSON.parse(cap.lines[0]!.line) as Record<string, unknown>;
    expect(typeof parsed.requestId).toBe('string');
    expect((parsed.requestId as string).length).toBeGreaterThan(8);
  });
});
