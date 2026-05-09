import { notFound } from 'next/navigation';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { blockPlacements, blocks as blocksTable, cheatsheets, getDb } from '@cheatsheet/db';
import type { Block, BlockPlacement } from '@cheatsheet/shared';
import { SharePageClient } from './SharePageClient';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Public read-only view of a shared cheatsheet. Anyone with the slug
 * can land here — no session required. The page renders the cheatsheet
 * at its actual dimensions and offers a "Fork to my library" button
 * that POSTs to /api/share/[slug]/fork on the visitor's device.
 */
export default async function SharePage({ params }: PageProps) {
  const { slug } = await params;
  const db = getDb();

  const [sheet] = await db
    .select()
    .from(cheatsheets)
    .where(eq(cheatsheets.publicSlug, slug))
    .limit(1);
  if (!sheet) notFound();

  const placementRows = await db
    .select()
    .from(blockPlacements)
    .where(eq(blockPlacements.cheatsheetId, sheet.id))
    .orderBy(asc(blockPlacements.zIndex));

  const blockIds = [...new Set(placementRows.map((p) => p.blockId))];
  const blockRows = blockIds.length
    ? await db
        .select()
        .from(blocksTable)
        .where(and(eq(blocksTable.deviceId, sheet.deviceId), inArray(blocksTable.id, blockIds)))
    : [];

  const blocks: Block[] = blockRows.map((b) => ({
    id: b.id,
    deviceId: b.deviceId,
    type: b.type as Block['type'],
    content: b.contentJson,
    tags: b.tags,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  }));

  const placements: BlockPlacement[] = placementRows.map((p) => ({
    id: p.id,
    cheatsheetId: p.cheatsheetId,
    blockId: p.blockId,
    x: p.x,
    y: p.y,
    width: p.width,
    height: p.height,
    rotation: p.rotation,
    zIndex: p.zIndex,
  }));

  return (
    <SharePageClient slug={slug} title={sheet.title} blocks={blocks} placements={placements} />
  );
}
