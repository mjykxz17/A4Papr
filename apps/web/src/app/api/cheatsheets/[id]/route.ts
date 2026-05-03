import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { cheatsheets, getDb } from '@cheatsheet/db';
import { readDeviceId } from '@/lib/session';

interface Ctx {
  params: Promise<{ id: string }>;
}

const PatchInput = z.object({
  title: z.string().min(1).max(200).optional(),
});

export async function PATCH(req: Request, { params }: Ctx) {
  const deviceId = await readDeviceId();
  if (!deviceId) return NextResponse.json({ error: 'no session' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = PatchInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const db = getDb();
  await db
    .update(cheatsheets)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(cheatsheets.id, id), eq(cheatsheets.deviceId, deviceId)));
  return NextResponse.json({ ok: true });
}
