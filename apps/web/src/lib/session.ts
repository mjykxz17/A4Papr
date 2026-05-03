/**
 * Device-cookie session.
 *
 * Every visitor gets a UUID (`device_id`) bound to a signed cookie. The
 * cookie value is `<uuid>.<base64url-hmac-sha256>`; the server verifies
 * the HMAC on every request before trusting the UUID.
 *
 * No users table in v1, so the device_id IS the persistence key for all
 * cheatsheets and blocks.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export const DEVICE_COOKIE = 'cs_device';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2; // 2 years

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('SESSION_SECRET must be set to a string of at least 16 chars');
  }
  return secret;
}

function sign(deviceId: string): string {
  const mac = createHmac('sha256', getSecret()).update(deviceId).digest('base64url');
  return `${deviceId}.${mac}`;
}

function verify(value: string): string | null {
  const dotIdx = value.indexOf('.');
  if (dotIdx <= 0) return null;
  const deviceId = value.slice(0, dotIdx);
  const givenMac = value.slice(dotIdx + 1);
  const expectedMac = createHmac('sha256', getSecret()).update(deviceId).digest('base64url');
  if (givenMac.length !== expectedMac.length) return null;
  const a = Buffer.from(givenMac);
  const b = Buffer.from(expectedMac);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  // simple uuid sanity check
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deviceId)) {
    return null;
  }
  return deviceId;
}

/**
 * Read the device_id from the cookie, minting a new one if absent or invalid.
 * Use from server components and route handlers.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const jar = await cookies();
  const raw = jar.get(DEVICE_COOKIE)?.value;
  if (raw) {
    const verified = verify(raw);
    if (verified) return verified;
  }
  const id = randomUUID();
  jar.set(DEVICE_COOKIE, sign(id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
  return id;
}

/** Read the device_id without minting one (returns null if missing/invalid). */
export async function readDeviceId(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(DEVICE_COOKIE)?.value;
  return raw ? verify(raw) : null;
}

/** Test helper: pure HMAC sign/verify without the cookie jar. */
export const _internal = { sign, verify };
