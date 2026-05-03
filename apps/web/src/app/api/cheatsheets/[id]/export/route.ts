import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { cheatsheets, getDb } from '@cheatsheet/db';
import { readDeviceId } from '@/lib/session';

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * Calls the long-lived worker to render a PDF, then streams it back
 * to the client as an attachment. Web tier just authenticates.
 */
export async function POST(_req: Request, { params }: Ctx) {
  const deviceId = await readDeviceId();
  if (!deviceId) return NextResponse.json({ error: 'no session' }, { status: 401 });
  const { id } = await params;

  const db = getDb();
  const [sheet] = await db
    .select()
    .from(cheatsheets)
    .where(and(eq(cheatsheets.id, id), eq(cheatsheets.deviceId, deviceId)))
    .limit(1);
  if (!sheet) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const workerUrl = process.env.WORKER_URL ?? 'http://localhost:4000';
  const sharedSecret = process.env.WORKER_SHARED_SECRET;
  if (!sharedSecret) {
    return NextResponse.json({ error: 'WORKER_SHARED_SECRET not set' }, { status: 500 });
  }

  const res = await fetch(`${workerUrl}/render`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${sharedSecret}`,
    },
    body: JSON.stringify({ cheatsheetId: id, deviceId }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return NextResponse.json(
      { error: `worker failed: ${res.status} ${text}` },
      { status: 502 },
    );
  }

  const today = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const filename = `${slugify(sheet.title)}_${today}.pdf`;

  return new NextResponse(res.body, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}

function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'cheatsheet';
}
