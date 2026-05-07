import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { cheatsheets, getDb } from '@cheatsheet/db';
import { readJsonBody } from '@/lib/http';
import { withRoute } from '@/lib/route-helpers';

const PatchInput = z.object({
  title: z.string().min(1).max(200).optional(),
});

export const PATCH = withRoute<{ id: string }>(async ({ req, deviceId, params }) => {
  const body = await readJsonBody(req);
  const parsed = PatchInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const db = getDb();
  await db
    .update(cheatsheets)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(cheatsheets.id, params.id), eq(cheatsheets.deviceId, deviceId)));
  return NextResponse.json({ ok: true });
});
