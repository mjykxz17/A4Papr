/**
 * Tests for the in-house SigV4 signer. We don't hit a real bucket; we
 * intercept `fetch` and assert on the headers + URL the signer
 * produces. The actual signature value depends on the date, so we
 * pin Date and verify the format + that the header round-trips.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { s3PutObject, type S3Config } from './s3.js';

const cfg: S3Config = {
  endpoint: 'https://acct.r2.cloudflarestorage.com',
  region: 'auto',
  bucket: 'cheatsheet-uploads',
  accessKeyId: 'AKIATESTKEY',
  secretAccessKey: 'sekret',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('s3PutObject', () => {
  it('PUTs to <endpoint>/<bucket>/<key> with SigV4 headers', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    const body = new TextEncoder().encode('hello');
    await s3PutObject(cfg, { key: 'abc.png', body, contentType: 'image/png' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    const u = url instanceof URL ? url : new URL(String(url));
    expect(u.host).toBe('acct.r2.cloudflarestorage.com');
    expect(u.pathname).toBe('/cheatsheet-uploads/abc.png');

    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers['content-type']).toBe('image/png');
    expect(headers['x-amz-content-sha256']).toMatch(/^[0-9a-f]{64}$/);
    expect(headers['x-amz-date']).toMatch(/^\d{8}T\d{6}Z$/);
    expect(headers.authorization).toMatch(
      new RegExp(
        `^AWS4-HMAC-SHA256 Credential=AKIATESTKEY/\\d{8}/auto/s3/aws4_request, ` +
          `SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, ` +
          `Signature=[0-9a-f]{64}$`,
      ),
    );

    expect(init?.method).toBe('PUT');
    // Body is wrapped as a Blob over the same bytes; verify the
    // round-trip rather than reference identity.
    const sent = init?.body as Blob;
    expect(sent).toBeInstanceOf(Blob);
    const sentBytes = new Uint8Array(await sent.arrayBuffer());
    expect(Array.from(sentBytes)).toEqual(Array.from(body));
  });

  it('throws with the response text when S3 returns non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('AccessDenied', { status: 403, statusText: 'Forbidden' }),
    );
    await expect(
      s3PutObject(cfg, {
        key: 'x.png',
        body: new Uint8Array(1),
        contentType: 'image/png',
      }),
    ).rejects.toThrow(/S3 PUT 403 Forbidden: AccessDenied/);
  });

  it('produces a deterministic signature for fixed date + body', async () => {
    // Pin time so two consecutive calls produce identical headers.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-07T12:00:00Z'));

    const calls: { headers: Record<string, string> }[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      calls.push({ headers: { ...((init?.headers ?? {}) as Record<string, string>) } });
      return new Response(null, { status: 200 });
    });

    const body = new TextEncoder().encode('same bytes');
    await s3PutObject(cfg, { key: 'a.png', body, contentType: 'image/png' });
    await s3PutObject(cfg, { key: 'a.png', body, contentType: 'image/png' });

    expect(calls).toHaveLength(2);
    expect(calls[0]!.headers.authorization).toBe(calls[1]!.headers.authorization);
    expect(calls[0]!.headers['x-amz-date']).toBe('20260507T120000Z');
    vi.useRealTimers();
  });
});
