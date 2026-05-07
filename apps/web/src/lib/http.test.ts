import { describe, expect, it } from 'vitest';
import { HttpError, readJsonBody, requireSameOrigin } from './http.js';

const ORIGIN = 'http://app.test';

function buildRequest(init: {
  method?: string;
  origin?: string;
  referer?: string;
  body?: string;
  contentLength?: string;
}): Request {
  const headers: Record<string, string> = {};
  if (init.origin) headers.origin = init.origin;
  if (init.referer) headers.referer = init.referer;
  if (init.contentLength) headers['content-length'] = init.contentLength;
  const method = init.method ?? 'POST';
  // GET/HEAD can't carry a body per the Fetch spec; only attach for
  // mutating methods.
  const carryBody = method !== 'GET' && method !== 'HEAD';
  return new Request('http://app.test/api/x', {
    method,
    headers,
    body: carryBody ? (init.body ?? '{}') : undefined,
  });
}

describe('requireSameOrigin', () => {
  it('passes GET regardless of origin', () => {
    expect(() =>
      requireSameOrigin(buildRequest({ method: 'GET', origin: 'http://evil.test' }), ORIGIN),
    ).not.toThrow();
  });

  it('passes POST when Origin matches', () => {
    expect(() =>
      requireSameOrigin(buildRequest({ method: 'POST', origin: ORIGIN }), ORIGIN),
    ).not.toThrow();
  });

  it('rejects POST with mismatched Origin', () => {
    let thrown: HttpError | undefined;
    try {
      requireSameOrigin(buildRequest({ method: 'POST', origin: 'http://evil.test' }), ORIGIN);
    } catch (e) {
      thrown = e as HttpError;
    }
    expect(thrown).toBeInstanceOf(HttpError);
    expect(thrown!.status).toBe(403);
  });

  it('falls back to Referer when Origin is absent', () => {
    expect(() =>
      requireSameOrigin(buildRequest({ method: 'POST', referer: `${ORIGIN}/editor/123` }), ORIGIN),
    ).not.toThrow();
  });

  it('rejects when both Origin and Referer are missing', () => {
    expect(() => requireSameOrigin(buildRequest({ method: 'POST' }), ORIGIN)).toThrow(HttpError);
  });

  it('rejects malformed Referer', () => {
    expect(() =>
      requireSameOrigin(buildRequest({ method: 'POST', referer: 'not a url' }), ORIGIN),
    ).toThrow(HttpError);
  });
});

describe('readJsonBody', () => {
  it('parses a small JSON body', async () => {
    const req = buildRequest({ body: JSON.stringify({ a: 1 }), origin: ORIGIN });
    expect(await readJsonBody(req)).toEqual({ a: 1 });
  });

  it('413s when Content-Length exceeds the cap', async () => {
    const req = new Request('http://app.test/x', {
      method: 'POST',
      headers: { 'content-length': '999999' },
      body: '{}',
    });
    let err: HttpError | undefined;
    try {
      await readJsonBody(req, { max: 100 });
    } catch (e) {
      err = e as HttpError;
    }
    expect(err).toBeInstanceOf(HttpError);
    expect(err!.status).toBe(413);
  });

  it('413s when body exceeds the cap even without Content-Length', async () => {
    const big = '{"x":"' + 'a'.repeat(2000) + '"}';
    const req = new Request('http://app.test/x', { method: 'POST', body: big });
    let err: HttpError | undefined;
    try {
      await readJsonBody(req, { max: 100 });
    } catch (e) {
      err = e as HttpError;
    }
    expect(err!.status).toBe(413);
  });

  it('400s on invalid JSON', async () => {
    const req = new Request('http://app.test/x', {
      method: 'POST',
      body: '{ broken',
    });
    await expect(readJsonBody(req)).rejects.toMatchObject({ status: 400 });
  });

  it('400s on empty body', async () => {
    const req = new Request('http://app.test/x', { method: 'POST', body: '' });
    await expect(readJsonBody(req)).rejects.toMatchObject({ status: 400 });
  });
});
