/**
 * Share toggle for a cheatsheet.
 *
 *   POST   → mints a public_slug if absent (no-op if already shared),
 *            returns `{ slug }`. Idempotent.
 *   DELETE → clears public_slug, breaking the public URL.
 *
 * The slug is 16 hex chars (~64 bits) — unguessable for read-by-URL but
 * compact in addresses.
 */
import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { cheatsheets, getDb } from '@cheatsheet/db';
import { recordEvent } from '@/lib/analytics';
import { withRoute } from '@/lib/route-helpers';

function mintSlug(): string {
  return randomBytes(8).toString('hex');
}

export const POST = withRoute<{ id: string }>(async ({ deviceId, params }) => {
  const db = getDb();
  const [existing] = await db
    .select({ slug: cheatsheets.publicSlug })
    .from(cheatsheets)
    .where(and(eq(cheatsheets.id, params.id), eq(cheatsheets.deviceId, deviceId)))
    .limit(1);
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (existing.slug) {
    return NextResponse.json({ slug: existing.slug });
  }

  // Retry on the (extremely unlikely) collision so callers never see
  // a 500 from a duplicate-key violation.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = mintSlug();
    try {
      await db
        .update(cheatsheets)
        .set({ publicSlug: slug })
        .where(and(eq(cheatsheets.id, params.id), eq(cheatsheets.deviceId, deviceId)));
      await recordEvent(deviceId, 'share_minted', { cheatsheetId: params.id });
      return NextResponse.json({ slug });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!/unique|duplicate/i.test(msg)) throw err;
    }
  }
  return NextResponse.json({ error: 'failed to mint slug' }, { status: 500 });
});

export const DELETE = withRoute<{ id: string }>(async ({ deviceId, params }) => {
  const db = getDb();
  await db
    .update(cheatsheets)
    .set({ publicSlug: null })
    .where(and(eq(cheatsheets.id, params.id), eq(cheatsheets.deviceId, deviceId)));
  await recordEvent(deviceId, 'share_revoked', { cheatsheetId: params.id });
  return NextResponse.json({ ok: true });
});
