import { describe, expect, it, beforeAll } from 'vitest';
import { _internal } from './session.js';

beforeAll(() => {
  process.env.SESSION_SECRET = 'a'.repeat(32);
});

describe('session HMAC', () => {
  it('signs and verifies a valid uuid', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    const cookie = _internal.sign(id);
    expect(cookie.startsWith(`${id}.`)).toBe(true);
    expect(_internal.verify(cookie)).toBe(id);
  });

  it('rejects tampered cookies', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    const cookie = _internal.sign(id);
    // flip a character in the MAC half
    const tampered = cookie.slice(0, -1) + (cookie.slice(-1) === 'A' ? 'B' : 'A');
    expect(_internal.verify(tampered)).toBeNull();
  });

  it('rejects cookies with non-uuid prefix', () => {
    const cookie = _internal.sign('not-a-uuid');
    expect(_internal.verify(cookie)).toBeNull();
  });

  it('rejects malformed cookies', () => {
    expect(_internal.verify('garbage')).toBeNull();
    expect(_internal.verify('')).toBeNull();
    expect(_internal.verify('.')).toBeNull();
  });
});
