import { describe, expect, it } from 'vitest';
import {
  BASE64_PATTERN,
  base64ByteLength,
  isExtractFileMime,
  MAX_EXTRACT_BODY_BYTES,
  MAX_EXTRACT_FILE_BYTES,
  MAX_EXTRACT_TOTAL_BYTES,
} from './extract-files.js';

describe('base64ByteLength', () => {
  it('matches actual decoded lengths', () => {
    for (const len of [0, 1, 2, 3, 4, 5, 100, 1024]) {
      const b64 = Buffer.alloc(len, 0xab).toString('base64');
      expect(base64ByteLength(b64)).toBe(len);
    }
  });

  it('returns 0 for the empty string', () => {
    expect(base64ByteLength('')).toBe(0);
  });
});

describe('BASE64_PATTERN', () => {
  it('accepts standard base64', () => {
    expect(BASE64_PATTERN.test(Buffer.from('hello world').toString('base64'))).toBe(true);
  });

  it('rejects data: URLs, whitespace, and url-safe alphabet', () => {
    expect(BASE64_PATTERN.test('data:image/png;base64,iVBOR')).toBe(false);
    expect(BASE64_PATTERN.test('aGVs\nbG8=')).toBe(false);
    expect(BASE64_PATTERN.test('aGVs bG8=')).toBe(false);
    expect(BASE64_PATTERN.test('aGVs-bG8_')).toBe(false);
    expect(BASE64_PATTERN.test('')).toBe(false);
  });
});

describe('isExtractFileMime', () => {
  it('accepts the supported set', () => {
    for (const m of ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']) {
      expect(isExtractFileMime(m)).toBe(true);
    }
  });

  it('rejects SVG and everything else', () => {
    expect(isExtractFileMime('image/svg+xml')).toBe(false);
    expect(isExtractFileMime('text/html')).toBe(false);
    expect(isExtractFileMime('')).toBe(false);
  });
});

describe('size budget', () => {
  it('keeps the worst-case body under the ~4.5 MB serverless cap', () => {
    expect(MAX_EXTRACT_BODY_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });

  it('per-file cap does not exceed the total cap', () => {
    expect(MAX_EXTRACT_FILE_BYTES).toBeLessThanOrEqual(MAX_EXTRACT_TOTAL_BYTES);
  });
});
