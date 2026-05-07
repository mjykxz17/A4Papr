import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestRender } from './worker-client.js';

afterEach(() => {
  vi.useRealTimers();
});

const baseOpts = {
  workerUrl: 'http://worker.test',
  sharedSecret: 's'.repeat(32),
  timeoutMs: 5_000,
};

describe('requestRender', () => {
  it('forwards args, sets the bearer header, and streams the body on 200', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(body, { status: 200, headers: { 'content-type': 'application/pdf' } }),
      );

    const result = await requestRender(
      { cheatsheetId: 'cs', deviceId: 'd' },
      { ...baseOpts, fetchImpl },
    );

    expect(result.ok).toBe(true);
    const url = fetchImpl.mock.calls[0]![0];
    const init = fetchImpl.mock.calls[0]![1];
    expect(url).toBe('http://worker.test/render');
    expect((init as RequestInit).headers).toMatchObject({
      authorization: `Bearer ${baseOpts.sharedSecret}`,
      'content-type': 'application/json',
    });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      cheatsheetId: 'cs',
      deviceId: 'd',
    });
  });

  it('returns 504 when the request aborts past the timeout', async () => {
    const fetchImpl = vi.fn().mockImplementation((_url, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const sig = init.signal as AbortSignal;
        sig.addEventListener('abort', () => {
          const err = new DOMException('aborted', 'AbortError');
          reject(err);
        });
      });
    });

    const promise = requestRender(
      { cheatsheetId: 'cs', deviceId: 'd' },
      { ...baseOpts, timeoutMs: 10, fetchImpl },
    );
    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(504);
      expect(result.message).toMatch(/timed out/);
    }
  });

  it('returns 502 when the worker is unreachable', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('connect ECONNREFUSED'));
    const result = await requestRender(
      { cheatsheetId: 'cs', deviceId: 'd' },
      { ...baseOpts, fetchImpl },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
      expect(result.message).toContain('Worker unreachable');
    }
  });

  it('returns 502 when the worker responds non-2xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    const result = await requestRender(
      { cheatsheetId: 'cs', deviceId: 'd' },
      { ...baseOpts, fetchImpl },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
      expect(result.message).toContain('500');
    }
  });
});
