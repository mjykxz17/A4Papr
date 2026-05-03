import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { cheatsheets, getDb } from '@cheatsheet/db';
import { getOrCreateDeviceId } from '@/lib/session';

/**
 * Landing route. Per spec §10 the editor must not be gated behind any
 * signup. We mint a device cookie if absent, find-or-create the user's
 * latest cheatsheet, and redirect straight into the editor.
 */
export default async function Home() {
  const deviceId = await getOrCreateDeviceId();
  const db = getDb();

  const [existing] = await db
    .select()
    .from(cheatsheets)
    .where(eq(cheatsheets.deviceId, deviceId))
    .orderBy(cheatsheets.updatedAt)
    .limit(1);

  let cheatsheetId = existing?.id;
  if (!cheatsheetId) {
    const [created] = await db
      .insert(cheatsheets)
      .values({ deviceId, title: 'Untitled cheatsheet' })
      .returning();
    cheatsheetId = created!.id;
  }

  // touch updatedAt so the device's "latest" is consistent
  await db
    .update(cheatsheets)
    .set({ updatedAt: new Date() })
    .where(and(eq(cheatsheets.id, cheatsheetId), eq(cheatsheets.deviceId, deviceId)));

  redirect(`/editor/${cheatsheetId}`);
}
