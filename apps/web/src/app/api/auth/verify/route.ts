/**
 * Magic-link verification.
 *
 *   GET /api/auth/verify?token=<base64url>
 *
 * Looks up the token, asserts it isn't expired or already consumed, then
 * sets the device cookie on the current visitor to the device_id stored
 * in `auth_claims`. Effect: this browser now sees the library that the
 * email is bound to.
 *
 * Skips the session requirement (this is the route that ESTABLISHES the
 * session) but uses CSRF=false because magic links arrive via email
 * navigation, which is cross-origin from any mail client.
 */
import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { authClaims, authTokens, getDb } from '@cheatsheet/db';
import { DEVICE_COOKIE } from '@/lib/session';
import { serverEnv } from '@/lib/env';
import { withRoute } from '@/lib/route-helpers';

function signDeviceId(deviceId: string, secret: string): string {
  const mac = createHmac('sha256', secret).update(deviceId).digest('base64url');
  return `${deviceId}.${mac}`;
}

export const GET = withRoute(
  async ({ req, logger }) => {
    const url = new URL(req.url);
    const token = url.searchParams.get('token') ?? '';
    if (!token || token.length > 200) {
      return NextResponse.json({ error: 'invalid token' }, { status: 400 });
    }

    const env = serverEnv();
    const db = getDb();
    const now = new Date();

    // Atomically consume the token: only mark consumed_at if it's still
    // null AND not expired. If the update touched 0 rows the token is
    // either spent or expired.
    const consumed = await db
      .update(authTokens)
      .set({ consumedAt: sql`now()` })
      .where(
        and(
          eq(authTokens.token, token),
          gt(authTokens.expiresAt, now),
          isNull(authTokens.consumedAt),
        ),
      )
      .returning({ email: authTokens.email });

    if (consumed.length === 0) {
      logger.warn('verify rejected', { reason: 'token not found / expired / used' });
      return NextResponse.json({ error: 'token expired or already used' }, { status: 410 });
    }

    const email = consumed[0]!.email;
    const [claim] = await db
      .select({ deviceId: authClaims.deviceId })
      .from(authClaims)
      .where(eq(authClaims.email, email))
      .limit(1);

    if (!claim) {
      // Should be unreachable if the claim/verify flow is consistent.
      logger.error('verify failed: token consumed but no claim row', { email });
      return NextResponse.json({ error: 'claim missing' }, { status: 500 });
    }

    const cookieValue = signDeviceId(claim.deviceId, env.SESSION_SECRET);
    const res = NextResponse.redirect(new URL('/', env.APP_URL));
    res.cookies.set(DEVICE_COOKIE, cookieValue, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365 * 2,
    });
    logger.info('verify ok', { email });
    return res;
  },
  // CSRF check off (cross-origin nav from email client is expected).
  // Session not required — this route MINTS the session.
  { requireSession: false, csrf: false },
);
