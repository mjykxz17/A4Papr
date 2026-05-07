import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { blocks, getDb } from '@cheatsheet/db';
import { UpdateBlockInput, type Block } from '@cheatsheet/shared';
import { readJsonBody } from '@/lib/http';
import { withRoute } from '@/lib/route-helpers';

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

export const PATCH = withRoute<{ id: string }>(async ({ req, deviceId, params }) => {
  const body = await readJsonBody(req);
  const parsed = UpdateBlockInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const db = getDb();
  const [row] = await db
    .update(blocks)
    .set({
      type: parsed.data.content.type,
      contentJson: parsed.data.content,
      ...(parsed.data.tags !== undefined ? { tags: parsed.data.tags } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(blocks.id, params.id), eq(blocks.deviceId, deviceId)))
    .returning();
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(rowToBlock(row));
});

export const DELETE = withRoute<{ id: string }>(async ({ deviceId, params }) => {
  const db = getDb();
  await db.delete(blocks).where(and(eq(blocks.id, params.id), eq(blocks.deviceId, deviceId)));
  return new NextResponse(null, { status: 204 });
});
