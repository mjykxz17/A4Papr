import { describe, expect, it } from 'vitest';
import { Email, mintToken, TOKEN_TTL_MS } from './auth-claim.js';

describe('Email schema', () => {
  it('accepts a simple address and lowercases it', () => {
    expect(Email.parse('Foo@Example.com')).toBe('foo@example.com');
  });

  it('trims whitespace', () => {
    expect(Email.parse('  bar@x.io  ')).toBe('bar@x.io');
  });

  it('rejects malformed input', () => {
    expect(() => Email.parse('not-an-email')).toThrow();
    expect(() => Email.parse('@no.local')).toThrow();
    expect(() => Email.parse('a@b')).toThrow(); // no TLD
    expect(() => Email.parse('')).toThrow();
  });

  it('caps length at 254 chars', () => {
    const long = 'a'.repeat(254) + '@x.io';
    expect(() => Email.parse(long)).toThrow();
  });
});

describe('mintToken', () => {
  it('returns 32 random bytes encoded base64url (43 chars, no padding)', () => {
    const t = mintToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBe(43); // 32 bytes → 43 base64url chars w/o padding
  });

  it('produces unique tokens', () => {
    const set = new Set(Array.from({ length: 100 }, () => mintToken()));
    expect(set.size).toBe(100);
  });
});

describe('TOKEN_TTL_MS', () => {
  it('is 30 minutes', () => {
    expect(TOKEN_TTL_MS).toBe(30 * 60_000);
  });
});
