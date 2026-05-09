/**
 * POST /api/share/[slug]/fork
 *
 * Copies the public cheatsheet (blocks + placements) to the current
 * device. Returns the new cheatsheet id so the client can redirect to
 * /editor/{id}. Public — anyone with the slug can fork.
 */
import { NextResponse } from 'next/server';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { blockPlacements, blocks, cheatsheets, getDb } from '@cheatsheet/db';
import { recordEvent } from '@/lib/analytics';
import { withRoute } from '@/lib/route-helpers';

export const POST = withRoute<{ slug: string }>(async ({ deviceId, params, logger }) => {
  const db = getDb();

  const [source] = await db
    .select()
    .from(cheatsheets)
    .where(eq(cheatsheets.publicSlug, params.slug))
    .limit(1);
  if (!source) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const sourcePlacements = await db
    .select()
    .from(blockPlacements)
    .where(eq(blockPlacements.cheatsheetId, source.id))
    .orderBy(asc(blockPlacements.zIndex));

  // Pull only the blocks referenced by the placements — sharing copies
  // the *visible* state, not the source library.
  const blockIds = [...new Set(sourcePlacements.map((p) => p.blockId))];
  const referencedBlocks = blockIds.length
    ? await db
        .select()
        .from(blocks)
        .where(and(eq(blocks.deviceId, source.deviceId), inArray(blocks.id, blockIds)))
    : [];

  const newCheatsheetId = await db.transaction(async (tx) => {
    const [sheet] = await tx
      .insert(cheatsheets)
      .values({ deviceId, title: `${source.title} (forked)` })
      .returning({ id: cheatsheets.id });

    if (referencedBlocks.length === 0) return sheet!.id;

    // Insert blocks first; build an old→new id map.
    const inserted = await tx
      .insert(blocks)
      .values(
        referencedBlocks.map((b) => ({
          deviceId,
          type: b.type,
          contentJson: b.contentJson,
          tags: b.tags,
        })),
      )
      .returning({ id: blocks.id });

    const idMap = new Map<string, string>();
    referencedBlocks.forEach((b, i) => idMap.set(b.id, inserted[i]!.id));

    if (sourcePlacements.length > 0) {
      await tx.insert(blockPlacements).values(
        sourcePlacements
          .filter((p) => idMap.has(p.blockId))
          .map((p) => ({
            cheatsheetId: sheet!.id,
            blockId: idMap.get(p.blockId)!,
            x: p.x,
            y: p.y,
            width: p.width,
            height: p.height,
            rotation: p.rotation,
            zIndex: p.zIndex,
          })),
      );
    }
    return sheet!.id;
  });

  await recordEvent(deviceId, 'share_forked', {
    sourceSlug: params.slug,
    sourceCheatsheetId: source.id,
  });
  logger.info('share forked', {
    sourceSlug: params.slug,
    newCheatsheetId,
  });

  return NextResponse.json({ id: newCheatsheetId }, { status: 201 });
});
