import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashBytes, sniffImageMime, storeImage } from './uploads.js';
import { _resetEnvCache } from './env.js';

describe('sniffImageMime', () => {
  it('detects PNG by magic bytes', () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
    ]);
    expect(sniffImageMime(png)).toEqual({ mime: 'image/png', ext: 'png' });
  });

  it('detects JPEG', () => {
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffImageMime(jpg)).toEqual({ mime: 'image/jpeg', ext: 'jpg' });
  });

  it('detects GIF', () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
    expect(sniffImageMime(gif)).toEqual({ mime: 'image/gif', ext: 'gif' });
  });

  it('detects WEBP', () => {
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffImageMime(webp)).toEqual({ mime: 'image/webp', ext: 'webp' });
  });

  it('rejects SVG / unknown / too-small', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(sniffImageMime(svg)).toBeNull();
    expect(sniffImageMime(new Uint8Array(2))).toBeNull();
    expect(sniffImageMime(new Uint8Array(12))).toBeNull();
  });
});

describe('hashBytes', () => {
  it('returns a hex SHA-256 of the input', () => {
    const empty = hashBytes(new Uint8Array(0));
    // sha256 of zero-length input
    expect(empty).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('produces stable hashes for the same bytes', () => {
    const a = hashBytes(new Uint8Array([1, 2, 3]));
    const b = hashBytes(new Uint8Array([1, 2, 3]));
    expect(a).toBe(b);
  });
});

describe('storeImage backend dispatch', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    _resetEnvCache();
  });

  afterEach(() => {
    // Restore env so tests don't leak state across files.
    for (const k of [
      'S3_ENDPOINT',
      'S3_BUCKET',
      'S3_REGION',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
      'S3_PUBLIC_URL',
    ]) {
      delete process.env[k];
    }
    Object.assign(process.env, originalEnv);
    _resetEnvCache();
    vi.restoreAllMocks();
  });

  it('uses the S3 backend when S3_BUCKET is set, returning the public URL', async () => {
    process.env.S3_ENDPOINT = 'https://acct.r2.cloudflarestorage.com';
    process.env.S3_BUCKET = 'cs-uploads';
    process.env.S3_REGION = 'auto';
    process.env.S3_ACCESS_KEY_ID = 'k';
    process.env.S3_SECRET_ACCESS_KEY = 's';
    process.env.S3_PUBLIC_URL = 'https://images.example.com';

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    const url = await storeImage(new Uint8Array([1, 2, 3]), 'deadbeef', 'png', 'image/png');
    expect(url).toBe('https://images.example.com/deadbeef.png');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('throws when S3_BUCKET is set but other secrets are missing', async () => {
    process.env.S3_BUCKET = 'cs-uploads';
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;

    await expect(storeImage(new Uint8Array(1), 'h', 'png', 'image/png')).rejects.toThrow(
      /set all four together/,
    );
  });
});
