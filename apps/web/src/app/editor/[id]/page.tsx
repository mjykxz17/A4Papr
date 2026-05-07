import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { blocks, blockPlacements, cheatsheets, getDb } from '@cheatsheet/db';
import { getOrCreateDeviceId } from '@/lib/session';
import { serverEnv } from '@/lib/env';
import { isMobileUserAgent } from '@/lib/is-mobile-ua';
import { Editor } from '@/components/Editor';
import { MobileGate, MOBILE_OVERRIDE_COOKIE } from '@/components/MobileGate';
import type { Block, BlockPlacement, Cheatsheet } from '@cheatsheet/shared';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditorPage({ params }: PageProps) {
  const { id } = await params;

  // Block phones from rendering the editor (drag-and-drop on a tiny
  // viewport produces unusable cheatsheets). The user can opt in via
  // a cookie that the gate sets on click — we don't gate that hard.
  const hdrs = await headers();
  const jar = await cookies();
  if (isMobileUserAgent(hdrs.get('user-agent')) && jar.get(MOBILE_OVERRIDE_COOKIE)?.value !== '1') {
    return <MobileGate />;
  }

  const deviceId = await getOrCreateDeviceId();
  const db = getDb();

  const [sheet] = await db
    .select()
    .from(cheatsheets)
    .where(and(eq(cheatsheets.id, id), eq(cheatsheets.deviceId, deviceId)))
    .limit(1);
  if (!sheet) notFound();

  const placementRows = await db
    .select()
    .from(blockPlacements)
    .where(eq(blockPlacements.cheatsheetId, sheet.id))
    .orderBy(asc(blockPlacements.zIndex));

  const blockRows = await db.select().from(blocks).where(eq(blocks.deviceId, deviceId));

  const cheatsheet: Cheatsheet = {
    id: sheet.id,
    deviceId: sheet.deviceId,
    title: sheet.title,
    paperSize: 'A4',
    orientation: 'portrait',
    createdAt: sheet.createdAt.toISOString(),
    updatedAt: sheet.updatedAt.toISOString(),
  };

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

  const library: Block[] = blockRows.map((b) => ({
    id: b.id,
    deviceId: b.deviceId,
    type: b.type as Block['type'],
    content: b.contentJson,
    tags: b.tags,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  }));

  return (
    <Editor
      cheatsheet={cheatsheet}
      initialPlacements={placements}
      initialLibrary={library}
      aiEnabled={!!serverEnv().ANTHROPIC_API_KEY}
    />
  );
}
