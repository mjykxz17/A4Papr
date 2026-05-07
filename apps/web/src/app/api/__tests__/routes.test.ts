/**
 * Route handler tests focused on the three things that don't require a
 * real database to verify:
 *   - authentication (missing/invalid session → 401)
 *   - request body validation (bad shape → 400)
 *   - feature-flag gates (e.g. ANTHROPIC_API_KEY → 503)
 *
 * Happy-path DB writes are covered by the shared schema tests
 * (validation) and the worker-client tests (export). End-to-end
 * persistence is exercised by Playwright when the DB is available.
 *
 * Drizzle's query builder is too deeply chained to mock in a
 * maintainable way; we deliberately stay above that boundary.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setUpEnv, mockCookies, TEST_DEVICE_ID } from './test-utils.js';

// Set env BEFORE the routes are imported (some routes parse env at boot).
beforeAll(() => {
  setUpEnv();
});

// --- mocks ---
// next/headers is a server-only API; tests stub it per-test.
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

// `@cheatsheet/db` is mocked just enough that imports succeed; routes
// that hit `getDb()` will throw deeper, but the validation paths under
// test return before reaching the db call.
vi.mock('@cheatsheet/db', () => ({
  getDb: vi.fn(() => {
    throw new Error('getDb should not be called in this validation-only test');
  }),
  blocks: {},
  cheatsheets: {},
  blockPlacements: {},
}));

// drizzle-orm exports (eq, and, etc.) are unused on the validation paths
// we test, but the routes import them. Provide lightweight stubs.
vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  sql: { raw: vi.fn() },
}));

import { cookies } from 'next/headers';
const cookiesMock = cookies as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  cookiesMock.mockReset();
});

afterAll(() => {
  vi.restoreAllMocks();
});

async function setNoSession(): Promise<void> {
  cookiesMock.mockResolvedValue(await mockCookies({ deviceId: null }));
}

async function setValidSession(): Promise<void> {
  cookiesMock.mockResolvedValue(await mockCookies({ deviceId: TEST_DEVICE_ID }));
}

describe('PATCH /api/blocks/[id]', () => {
  it('returns 401 when no session cookie is present', async () => {
    await setNoSession();
    const { PATCH } = await import('../blocks/[id]/route.js');
    const res = await PATCH(new Request('http://test/api/blocks/x', { method: 'PATCH' }), {
      params: Promise.resolve({ id: 'x' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 on a malformed payload', async () => {
    await setValidSession();
    const { PATCH } = await import('../blocks/[id]/route.js');
    const res = await PATCH(
      new Request('http://test/api/blocks/x', {
        method: 'PATCH',
        body: JSON.stringify({ content: { type: 'NOT_A_TYPE' } }),
      }),
      { params: Promise.resolve({ id: 'x' }) },
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/cheatsheets/[id]/placements', () => {
  it('returns 401 without a session', async () => {
    await setNoSession();
    const { POST } = await import('../cheatsheets/[id]/placements/route.js');
    const res = await POST(
      new Request('http://test/api/cheatsheets/cs/placements', { method: 'POST' }),
      { params: Promise.resolve({ id: 'cs' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 on a malformed PlacementPatch', async () => {
    await setValidSession();
    const { POST } = await import('../cheatsheets/[id]/placements/route.js');
    const res = await POST(
      new Request('http://test/api/cheatsheets/cs/placements', {
        method: 'POST',
        body: JSON.stringify({ upserts: 'not an array', deletes: [] }),
      }),
      { params: Promise.resolve({ id: 'cs' }) },
    );
    expect(res.status).toBe(400);
  });

  it('rejects placements that fall off the page (A4 bounds)', async () => {
    await setValidSession();
    const { POST } = await import('../cheatsheets/[id]/placements/route.js');
    const res = await POST(
      new Request('http://test/api/cheatsheets/cs/placements', {
        method: 'POST',
        body: JSON.stringify({
          upserts: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              blockId: '22222222-2222-4222-8222-222222222222',
              x: 200, // x + width = 250 → past A4 width of 210
              y: 10,
              width: 50,
              height: 30,
            },
          ],
          deletes: [],
        }),
      }),
      { params: Promise.resolve({ id: 'cs' }) },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { fieldErrors?: Record<string, string[]> } };
    expect(JSON.stringify(body.error)).toMatch(/right edge|page/);
  });
});

describe('PATCH /api/cheatsheets/[id]', () => {
  it('returns 401 without a session', async () => {
    await setNoSession();
    const { PATCH } = await import('../cheatsheets/[id]/route.js');
    const res = await PATCH(new Request('http://test/api/cheatsheets/cs', { method: 'PATCH' }), {
      params: Promise.resolve({ id: 'cs' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 on title too long', async () => {
    await setValidSession();
    const { PATCH } = await import('../cheatsheets/[id]/route.js');
    const res = await PATCH(
      new Request('http://test/api/cheatsheets/cs', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'a'.repeat(500) }),
      }),
      { params: Promise.resolve({ id: 'cs' }) },
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/extract', () => {
  it('returns 401 without a session', async () => {
    await setNoSession();
    const { POST } = await import('../extract/route.js');
    const res = await POST(new Request('http://test/api/extract', { method: 'POST' }));
    expect(res.status).toBe(401);
  });

  it('returns 503 when ANTHROPIC_API_KEY is not configured', async () => {
    await setValidSession();
    delete process.env.ANTHROPIC_API_KEY;
    // bust env cache
    const { _resetEnvCache } = await import('@/lib/env');
    _resetEnvCache();
    const { POST } = await import('../extract/route.js');
    const res = await POST(
      new Request('http://test/api/extract', {
        method: 'POST',
        body: JSON.stringify({ text: 'a'.repeat(50) }),
      }),
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/ANTHROPIC_API_KEY/);
  });

  it('returns 400 when text is too short', async () => {
    await setValidSession();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const { _resetEnvCache } = await import('@/lib/env');
    _resetEnvCache();
    const { POST } = await import('../extract/route.js');
    const res = await POST(
      new Request('http://test/api/extract', {
        method: 'POST',
        body: JSON.stringify({ text: 'short' }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
