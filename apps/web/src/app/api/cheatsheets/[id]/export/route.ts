import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { cheatsheets, getDb } from '@cheatsheet/db';
import { serverEnv } from '@/lib/env';
import { withRoute } from '@/lib/route-helpers';
import { requestRender } from '@/lib/worker-client';

/**
 * Calls the long-lived worker to render a PDF, then streams it back
 * to the client as an attachment. Web tier just authenticates.
 */
export const POST = withRoute<{ id: string }>(async ({ deviceId, params, logger }) => {
  const { id } = params;
  const db = getDb();
  const [sheet] = await db
    .select()
    .from(cheatsheets)
    .where(and(eq(cheatsheets.id, id), eq(cheatsheets.deviceId, deviceId)))
    .limit(1);
  if (!sheet) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const env = serverEnv();
  const result = await requestRender(
    { cheatsheetId: id, deviceId },
    {
      workerUrl: env.WORKER_URL,
      sharedSecret: env.WORKER_SHARED_SECRET,
      timeoutMs: env.WORKER_RENDER_TIMEOUT_MS,
    },
  );

  if (!result.ok) {
    logger.warn('worker render failed', { status: result.status, message: result.message });
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  const today = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const filename = `${slugify(sheet.title)}_${today}.pdf`;

  return new NextResponse(result.body, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
});

function slugify(s: string): string {
  return (
    s
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'cheatsheet'
  );
}
