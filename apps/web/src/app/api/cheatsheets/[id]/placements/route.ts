import { NextResponse } from 'next/server';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { blockPlacements, blocks, cheatsheets, getDb } from '@cheatsheet/db';
import { PlacementPatch, normalisePlacement } from '@cheatsheet/shared';
import { readJsonBody } from '@/lib/http';
import { withRoute } from '@/lib/route-helpers';

/**
 * Bulk patch placements. The auto-saver sends every changed placement
 * (upserts) and every removed one (deletes) in a single debounced call.
 *
 * Body cap is generous (1 MB) because a session with many placements can
 * legitimately produce a large patch.
 */
export const POST = withRoute<{ id: string }>(async ({ req, deviceId, params }) => {
  const body = await readJsonBody(req, { max: 1_000_000 });
  const parsed = PlacementPatch.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { upserts, deletes } = parsed.data;
  const cheatsheetId = params.id;

  const db = getDb();
  const [sheet] = await db
    .select({ id: cheatsheets.id })
    .from(cheatsheets)
    .where(and(eq(cheatsheets.id, cheatsheetId), eq(cheatsheets.deviceId, deviceId)))
    .limit(1);
  if (!sheet) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Verify every referenced blockId belongs to this device — prevents
  // cross-device tampering via guessed UUIDs.
  if (upserts.length > 0) {
    const blockIds = [...new Set(upserts.map((u) => u.blockId))];
    const owned = await db
      .select({ id: blocks.id })
      .from(blocks)
      .where(and(inArray(blocks.id, blockIds), eq(blocks.deviceId, deviceId)));
    const ownedSet = new Set(owned.map((o) => o.id));
    for (const u of upserts) {
      if (!ownedSet.has(u.blockId)) {
        return NextResponse.json({ error: `block ${u.blockId} not owned` }, { status: 403 });
      }
    }
  }

  await db.transaction(async (tx) => {
    if (deletes.length > 0) {
      await tx
        .delete(blockPlacements)
        .where(
          and(eq(blockPlacements.cheatsheetId, cheatsheetId), inArray(blockPlacements.id, deletes)),
        );
    }
    for (const raw of upserts) {
      // Client mints UUIDs and always sends one. Use a real upsert
      // (insert-on-conflict-do-update) so a placement created on the
      // client and then dragged auto-reconciles to a single row.
      if (!raw.id) continue;
      // Clamp to A4 before persisting. Schema validation tolerates a
      // small overflow slack; storage should always be exactly on-page.
      const u = normalisePlacement(raw);
      await tx
        .insert(blockPlacements)
        .values({
          id: u.id,
          cheatsheetId,
          blockId: u.blockId,
          x: u.x,
          y: u.y,
          width: u.width,
          height: u.height,
          rotation: u.rotation,
          zIndex: u.zIndex,
        })
        .onConflictDoUpdate({
          target: blockPlacements.id,
          set: {
            blockId: u.blockId,
            x: u.x,
            y: u.y,
            width: u.width,
            height: u.height,
            rotation: u.rotation,
            zIndex: u.zIndex,
          },
        });
    }
    await tx
      .update(cheatsheets)
      .set({ updatedAt: sql`now()` })
      .where(eq(cheatsheets.id, cheatsheetId));
  });

  return NextResponse.json({ ok: true });
});
