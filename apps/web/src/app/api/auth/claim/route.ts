/**
 * Bind an email to the current device, then "send" a magic link to that
 * email so a different device can adopt the same library by clicking it.
 *
 * Currently the link is logged to the server's stderr — see auth-claim.ts.
 * The response is intentionally generic ("ok") so an attacker can't
 * enumerate which emails have been claimed.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { authClaims, authTokens, getDb } from '@cheatsheet/db';
import { Email, mintToken, TOKEN_TTL_MS, stderrDelivery } from '@/lib/auth-claim';
import { serverEnv } from '@/lib/env';
import { readJsonBody } from '@/lib/http';
import { withRoute } from '@/lib/route-helpers';

const RequestBody = z.object({ email: Email });

export const POST = withRoute(async ({ req, deviceId, logger }) => {
  const body = await readJsonBody(req, { max: 4 * 1024 });
  const parsed = RequestBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const email = parsed.data.email;

  const db = getDb();

  // Upsert the email→device_id binding so claiming from a new device
  // simply re-binds; legitimate users hitting this from multiple devices
  // converge on the most-recent device's library.
  await db
    .insert(authClaims)
    .values({ email, deviceId })
    .onConflictDoUpdate({
      target: authClaims.email,
      set: { deviceId, updatedAt: sql`now()` },
    });

  const token = mintToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await db.insert(authTokens).values({ token, email, expiresAt });

  const url = new URL('/api/auth/verify', serverEnv().APP_URL);
  url.searchParams.set('token', token);

  await stderrDelivery.deliver({
    email,
    url: url.toString(),
    expiresAtMs: expiresAt.getTime(),
  });

  logger.info('claim issued', { email });

  // Generic response — never reveal whether the email was already claimed.
  return NextResponse.json({ ok: true });
});
