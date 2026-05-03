import { NextResponse, type NextRequest } from 'next/server';

/**
 * Mint the signed device cookie on first request. Server components in
 * Next 15 can't write cookies — only middleware, route handlers, and
 * server actions can — so this is the one place where we mint the
 * device_id. Subsequent server components just read it.
 *
 * Runs in the Edge runtime, so we use Web Crypto (SubtleCrypto.HMAC)
 * instead of node:crypto.
 */

const DEVICE_COOKIE = 'cs_device';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2;

function uuid(): string {
  return crypto.randomUUID();
}

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function sign(deviceId: string, secret: string): Promise<string> {
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(deviceId));
  return `${deviceId}.${toBase64Url(sig)}`;
}

async function isValid(value: string, secret: string): Promise<boolean> {
  const dotIdx = value.indexOf('.');
  if (dotIdx <= 0) return false;
  const deviceId = value.slice(0, dotIdx);
  const givenMac = value.slice(dotIdx + 1);
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(deviceId));
  const expected = toBase64Url(sig);
  if (givenMac.length !== expected.length) return false;
  // constant-time-ish compare
  let diff = 0;
  for (let i = 0; i < givenMac.length; i++) {
    diff |= givenMac.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export async function middleware(req: NextRequest) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    return NextResponse.json({ error: 'SESSION_SECRET not configured' }, { status: 500 });
  }
  const existing = req.cookies.get(DEVICE_COOKIE)?.value;
  if (existing && (await isValid(existing, secret))) return NextResponse.next();

  const id = uuid();
  const res = NextResponse.next();
  res.cookies.set(DEVICE_COOKIE, await sign(id, secret), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}

export const config = {
  // Skip static assets and Next internals.
  matcher: ['/((?!_next/|favicon|.*\\..*).*)'],
};
