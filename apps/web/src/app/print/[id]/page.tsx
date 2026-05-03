import { notFound } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { blocks, blockPlacements, cheatsheets, getDb } from '@cheatsheet/db';
import { A4 } from '@cheatsheet/shared';
import { BlockView } from '@/components/blocks/BlockView';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ device?: string; key?: string }>;
}

export const dynamic = 'force-dynamic';

/**
 * The route Puppeteer navigates to. Authenticates with the worker
 * shared secret instead of a device cookie (Chromium can't share
 * cookies with the web tier easily across hosts in prod).
 *
 * Layout is A4 in millimetres — `@page` + body size matches Chromium's
 * print sheet exactly so `page.pdf({ format: 'A4', preferCSSPageSize: true })`
 * round-trips with no scaling.
 */
export default async function PrintPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { device, key } = await searchParams;

  const expectedKey = process.env.WORKER_SHARED_SECRET;
  if (!expectedKey || key !== expectedKey || !device) {
    notFound();
  }

  const db = getDb();
  const [sheet] = await db
    .select()
    .from(cheatsheets)
    .where(and(eq(cheatsheets.id, id), eq(cheatsheets.deviceId, device)))
    .limit(1);
  if (!sheet) notFound();

  const placements = await db
    .select()
    .from(blockPlacements)
    .where(eq(blockPlacements.cheatsheetId, sheet.id))
    .orderBy(asc(blockPlacements.zIndex));

  const blockRows = await db.select().from(blocks).where(eq(blocks.deviceId, device));
  const byId = new Map(blockRows.map((b) => [b.id, b]));

  return (
    <div
      className="print-root"
      style={{
        width: `${A4.widthMm}mm`,
        height: `${A4.heightMm}mm`,
        position: 'relative',
        background: 'white',
        overflow: 'hidden',
      }}
    >
      {placements.map((p) => {
        const block = byId.get(p.blockId);
        if (!block) return null;
        return (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              left: `${p.x}mm`,
              top: `${p.y}mm`,
              width: `${p.width}mm`,
              height: `${p.height}mm`,
              transform: p.rotation ? `rotate(${p.rotation}deg)` : undefined,
              zIndex: p.zIndex,
              background: 'white',
              boxSizing: 'border-box',
            }}
          >
            <BlockView content={block.contentJson} />
          </div>
        );
      })}
    </div>
  );
}
