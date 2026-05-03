import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { blocks, getDb } from '@cheatsheet/db';
import { CreateBlockInput, type Block } from '@cheatsheet/shared';
import { getOrCreateDeviceId } from '@/lib/session';

function rowToBlock(row: typeof blocks.$inferSelect): Block {
  return {
    id: row.id,
    deviceId: row.deviceId,
    type: row.type as Block['type'],
    content: row.contentJson,
    tags: row.tags,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET() {
  const deviceId = await getOrCreateDeviceId();
  const db = getDb();
  const rows = await db.select().from(blocks).where(eq(blocks.deviceId, deviceId));
  return NextResponse.json(rows.map(rowToBlock));
}

export async function POST(req: Request) {
  const deviceId = await getOrCreateDeviceId();
  const body = await req.json().catch(() => null);
  const parsed = CreateBlockInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.content.type !== parsed.data.type) {
    return NextResponse.json({ error: 'type/content mismatch' }, { status: 400 });
  }
  const db = getDb();
  const [row] = await db
    .insert(blocks)
    .values({
      deviceId,
      type: parsed.data.type,
      contentJson: parsed.data.content,
      tags: parsed.data.tags,
    })
    .returning();
  return NextResponse.json(rowToBlock(row!), { status: 201 });
}
