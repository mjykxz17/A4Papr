/**
 * Liveness + readiness probe.
 *
 *   GET /api/healthz  → { ok: true, db: 'up' } if the DB ping succeeds
 *   GET /api/healthz  → 503 { ok: false, db: 'down' } if it fails
 *
 * Cheap enough to call from a load balancer every few seconds; the DB
 * round-trip is `SELECT 1`, no schema reads.
 *
 * Skips the CSRF check and the session requirement — load balancers
 * are out-of-origin and don't have cookies.
 */
import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@cheatsheet/db';
import { withRoute } from '@/lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withRoute(
  async ({ logger }) => {
    try {
      const db = getDb();
      await db.execute(sql`select 1`);
      return NextResponse.json({ ok: true, db: 'up' });
    } catch (err) {
      logger.error('healthz db ping failed', { err: String(err) });
      return NextResponse.json({ ok: false, db: 'down' }, { status: 503 });
    }
  },
  { requireSession: false, csrf: false },
);
