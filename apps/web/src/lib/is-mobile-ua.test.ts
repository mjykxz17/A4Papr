import { describe, expect, it } from 'vitest';
import { isMobileUserAgent } from './is-mobile-ua.js';

describe('isMobileUserAgent', () => {
  it('returns false for empty/null UAs (fail-open)', () => {
    expect(isMobileUserAgent(null)).toBe(false);
    expect(isMobileUserAgent('')).toBe(false);
    expect(isMobileUserAgent(undefined)).toBe(false);
  });

  it('detects iPhone', () => {
    expect(
      isMobileUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe(true);
  });

  it('detects Android phones', () => {
    expect(
      isMobileUserAgent(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537 Chrome/120 Mobile Safari/537',
      ),
    ).toBe(true);
  });

  it('treats iPad as desktop', () => {
    expect(
      isMobileUserAgent(
        'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605 Version/17.0 Safari/604.1',
      ),
    ).toBe(false);
  });

  it('treats Android tablets as desktop', () => {
    // No "Mobile" token → treated as a tablet.
    expect(
      isMobileUserAgent(
        'Mozilla/5.0 (Linux; Android 14; SM-T500) AppleWebKit/537 Chrome/120 Safari/537',
      ),
    ).toBe(false);
  });

  it('returns false for desktop Chrome', () => {
    expect(
      isMobileUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537 Chrome/120 Safari/537',
      ),
    ).toBe(false);
  });
});
