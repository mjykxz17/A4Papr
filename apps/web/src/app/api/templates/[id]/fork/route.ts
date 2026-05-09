/**
 * POST /api/templates/[id]/fork
 *
 * Creates a fresh cheatsheet on the current device and copies the
 * template's blocks + placements into it. Returns the new cheatsheet id
 * so the client can redirect to /editor/{id}.
 */
import { NextResponse } from 'next/server';
import { blockPlacements, blocks, cheatsheets, getDb } from '@cheatsheet/db';
import { recordEvent } from '@/lib/analytics';
import { withRoute } from '@/lib/route-helpers';
import { templateById } from '@/lib/templates';

export const POST = withRoute<{ id: string }>(async ({ deviceId, params, logger }) => {
  const tpl = templateById(params.id);
  if (!tpl) return NextResponse.json({ error: 'unknown template' }, { status: 404 });

  const db = getDb();
  const newCheatsheetId = await db.transaction(async (tx) => {
    const [sheet] = await tx
      .insert(cheatsheets)
      .values({ deviceId, title: tpl.name })
      .returning({ id: cheatsheets.id });

    // Insert all blocks at once so we can match each placement back to
    // its newly-minted block id by index.
    const insertedBlocks = await tx
      .insert(blocks)
      .values(
        tpl.blocks.map((b) => ({
          deviceId,
          type: b.type,
          contentJson: b.content,
          tags: b.tags,
        })),
      )
      .returning({ id: blocks.id });

    if (tpl.placements.length > 0) {
      await tx.insert(blockPlacements).values(
        tpl.placements.map((p) => ({
          cheatsheetId: sheet!.id,
          blockId: insertedBlocks[p.blockIndex]!.id,
          x: p.x,
          y: p.y,
          width: p.width,
          height: p.height,
          rotation: 0,
          zIndex: p.zIndex ?? 0,
        })),
      );
    }
    return sheet!.id;
  });

  await recordEvent(deviceId, 'template_forked', { templateId: tpl.id });
  logger.info('template forked', { templateId: tpl.id, cheatsheetId: newCheatsheetId });

  return NextResponse.json({ id: newCheatsheetId }, { status: 201 });
});
