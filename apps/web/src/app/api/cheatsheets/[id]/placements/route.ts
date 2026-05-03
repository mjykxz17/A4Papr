import { NextResponse } from 'next/server';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { blockPlacements, blocks, cheatsheets, getDb } from '@cheatsheet/db';
import { PlacementPatch } from '@cheatsheet/shared';
import { readDeviceId } from '@/lib/session';

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * Bulk patch placements. The auto-saver sends every changed placement
 * (upserts) and every removed one (deletes) in a single debounced call.
 */
export async function POST(req: Request, { params }: Ctx) {
  const deviceId = await readDeviceId();
  if (!deviceId) return NextResponse.json({ error: 'no session' }, { status: 401 });
  const { id: cheatsheetId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = PlacementPatch.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { upserts, deletes } = parsed.data;

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
          and(
            eq(blockPlacements.cheatsheetId, cheatsheetId),
            inArray(blockPlacements.id, deletes),
          ),
        );
    }
    for (const u of upserts) {
      if (u.id) {
        await tx
          .update(blockPlacements)
          .set({
            blockId: u.blockId,
            x: u.x,
            y: u.y,
            width: u.width,
            height: u.height,
            rotation: u.rotation,
            zIndex: u.zIndex,
          })
          .where(
            and(
              eq(blockPlacements.id, u.id),
              eq(blockPlacements.cheatsheetId, cheatsheetId),
            ),
          );
      } else {
        await tx.insert(blockPlacements).values({
          cheatsheetId,
          blockId: u.blockId,
          x: u.x,
          y: u.y,
          width: u.width,
          height: u.height,
          rotation: u.rotation,
          zIndex: u.zIndex,
        });
      }
    }
    await tx
      .update(cheatsheets)
      .set({ updatedAt: sql`now()` })
      .where(eq(cheatsheets.id, cheatsheetId));
  });

  return NextResponse.json({ ok: true });
}
