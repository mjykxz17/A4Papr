/**
 * Route handler tests focused on the things that don't require a real
 * database to verify:
 *   - authentication (missing/invalid session → 401)
 *   - cross-origin rejection (mismatched Origin → 403)
 *   - request body validation (bad shape → 400, oversize → 413)
 *   - feature-flag gates (e.g. ANTHROPIC_API_KEY → 503)
 *
 * Happy-path DB writes are covered by the shared schema tests
 * (validation) and the worker-client tests (export). End-to-end
 * persistence is exercised by Playwright when the DB is available.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setUpEnv, mockCookies, buildRequest, TEST_APP_URL, TEST_DEVICE_ID } from './test-utils.js';

beforeAll(() => {
  setUpEnv();
});

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('@cheatsheet/db', () => ({
  getDb: vi.fn(() => {
    throw new Error('getDb should not be called in this validation-only test');
  }),
  blocks: {},
  cheatsheets: {},
  blockPlacements: {},
  aiUsage: {},
  authClaims: {},
  authTokens: {},
  imageUploads: {},
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  gt: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
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

describe('CSRF (Origin enforcement)', () => {
  it('PATCH /api/blocks/[id] rejects a cross-origin POST', async () => {
    await setValidSession();
    const { PATCH } = await import('../blocks/[id]/route.js');
    const res = await PATCH(
      buildRequest(`${TEST_APP_URL}/api/blocks/x`, {
        method: 'PATCH',
        origin: 'http://evil.test',
        body: { content: { type: 'text', markdown: 'x', fontSize: 'sm', align: 'left' } },
      }),
      { params: Promise.resolve({ id: 'x' }) },
    );
    expect(res.status).toBe(403);
  });

  it('POST /api/blocks rejects a request with no Origin or Referer', async () => {
    await setValidSession();
    const { POST } = await import('../blocks/route.js');
    const res = await POST(
      buildRequest(`${TEST_APP_URL}/api/blocks`, { method: 'POST', origin: null }),
    );
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/blocks/[id]', () => {
  it('returns 401 when no session cookie is present', async () => {
    await setNoSession();
    const { PATCH } = await import('../blocks/[id]/route.js');
    const res = await PATCH(buildRequest(`${TEST_APP_URL}/api/blocks/x`, { method: 'PATCH' }), {
      params: Promise.resolve({ id: 'x' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 on a malformed payload', async () => {
    await setValidSession();
    const { PATCH } = await import('../blocks/[id]/route.js');
    const res = await PATCH(
      buildRequest(`${TEST_APP_URL}/api/blocks/x`, {
        method: 'PATCH',
        body: { content: { type: 'NOT_A_TYPE' } },
      }),
      { params: Promise.resolve({ id: 'x' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 413 when body is over the cap', async () => {
    await setValidSession();
    const { PATCH } = await import('../blocks/[id]/route.js');
    const big = JSON.stringify({ content: { x: 'a'.repeat(400_000) } });
    const res = await PATCH(
      buildRequest(`${TEST_APP_URL}/api/blocks/x`, { method: 'PATCH', body: big }),
      { params: Promise.resolve({ id: 'x' }) },
    );
    expect(res.status).toBe(413);
  });
});

describe('POST /api/cheatsheets/[id]/placements', () => {
  it('returns 401 without a session', async () => {
    await setNoSession();
    const { POST } = await import('../cheatsheets/[id]/placements/route.js');
    const res = await POST(
      buildRequest(`${TEST_APP_URL}/api/cheatsheets/cs/placements`, { method: 'POST' }),
      { params: Promise.resolve({ id: 'cs' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 on a malformed PlacementPatch', async () => {
    await setValidSession();
    const { POST } = await import('../cheatsheets/[id]/placements/route.js');
    const res = await POST(
      buildRequest(`${TEST_APP_URL}/api/cheatsheets/cs/placements`, {
        method: 'POST',
        body: { upserts: 'not an array', deletes: [] },
      }),
      { params: Promise.resolve({ id: 'cs' }) },
    );
    expect(res.status).toBe(400);
  });

  it('rejects placements that fall off the page (A4 bounds)', async () => {
    await setValidSession();
    const { POST } = await import('../cheatsheets/[id]/placements/route.js');
    const res = await POST(
      buildRequest(`${TEST_APP_URL}/api/cheatsheets/cs/placements`, {
        method: 'POST',
        body: {
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
        },
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
    const res = await PATCH(
      buildRequest(`${TEST_APP_URL}/api/cheatsheets/cs`, { method: 'PATCH' }),
      { params: Promise.resolve({ id: 'cs' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 on title too long', async () => {
    await setValidSession();
    const { PATCH } = await import('../cheatsheets/[id]/route.js');
    const res = await PATCH(
      buildRequest(`${TEST_APP_URL}/api/cheatsheets/cs`, {
        method: 'PATCH',
        body: { title: 'a'.repeat(500) },
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
    const res = await POST(
      buildRequest(`${TEST_APP_URL}/api/extract`, { method: 'POST', body: '{}' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 503 when ANTHROPIC_API_KEY is not configured', async () => {
    await setValidSession();
    delete process.env.ANTHROPIC_API_KEY;
    const { _resetEnvCache } = await import('@/lib/env');
    _resetEnvCache();
    const { _resetExtractLimiter } = await import('@/lib/extract-rate-limit');
    _resetExtractLimiter();
    const { POST } = await import('../extract/route.js');
    const res = await POST(
      buildRequest(`${TEST_APP_URL}/api/extract`, {
        method: 'POST',
        body: { text: 'a'.repeat(50) },
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
    const { _resetExtractLimiter } = await import('@/lib/extract-rate-limit');
    _resetExtractLimiter();
    const { POST } = await import('../extract/route.js');
    const res = await POST(
      buildRequest(`${TEST_APP_URL}/api/extract`, {
        method: 'POST',
        body: { text: 'short' },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when an attachment is not raw base64', async () => {
    await setValidSession();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const { _resetEnvCache } = await import('@/lib/env');
    _resetEnvCache();
    const { _resetExtractLimiter } = await import('@/lib/extract-rate-limit');
    _resetExtractLimiter();
    const { POST } = await import('../extract/route.js');
    const res = await POST(
      buildRequest(`${TEST_APP_URL}/api/extract`, {
        method: 'POST',
        body: {
          files: [{ mediaType: 'image/png', data: 'data:image/png;base64,AAAA', name: 'x.png' }],
        },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 415 when attachment bytes are not a supported image or PDF', async () => {
    await setValidSession();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const { _resetEnvCache } = await import('@/lib/env');
    _resetEnvCache();
    const { _resetExtractLimiter } = await import('@/lib/extract-rate-limit');
    _resetExtractLimiter();
    const { POST } = await import('../extract/route.js');
    // Valid base64, but the decoded bytes are plain text — the declared
    // image/png must not be trusted.
    const data = Buffer.from('<svg>not really an image</svg>').toString('base64');
    const res = await POST(
      buildRequest(`${TEST_APP_URL}/api/extract`, {
        method: 'POST',
        body: { files: [{ mediaType: 'image/png', data, name: 'fake.png' }] },
      }),
    );
    expect(res.status).toBe(415);
  });

  it('returns 429 when the per-device rate limit is exhausted', async () => {
    await setValidSession();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.EXTRACT_RATE_LIMIT_PER_MIN = '1';
    const { _resetEnvCache } = await import('@/lib/env');
    _resetEnvCache();
    const { _resetExtractLimiter } = await import('@/lib/extract-rate-limit');
    _resetExtractLimiter();
    const { POST } = await import('../extract/route.js');
    const send = () =>
      POST(
        buildRequest(`${TEST_APP_URL}/api/extract`, {
          method: 'POST',
          body: { text: 'a'.repeat(50) },
        }),
      );
    // first burst eats the only token
    await send();
    const res = await send();
    expect(res.status).toBe(429);
    delete process.env.EXTRACT_RATE_LIMIT_PER_MIN;
  });
});
