import { describe, expect, it } from 'vitest';
import { isKnownEventName } from './analytics.js';

describe('isKnownEventName', () => {
  it('accepts every documented event', () => {
    expect(isKnownEventName('landed')).toBe(true);
    expect(isKnownEventName('block_created')).toBe(true);
    expect(isKnownEventName('pdf_exported')).toBe(true);
    expect(isKnownEventName('share_minted')).toBe(true);
    expect(isKnownEventName('tidy_applied')).toBe(true);
  });

  it('rejects typos and unknown names', () => {
    expect(isKnownEventName('block_create')).toBe(false);
    expect(isKnownEventName('pdf_export')).toBe(false);
    expect(isKnownEventName('')).toBe(false);
    expect(isKnownEventName('lol')).toBe(false);
  });
});
