/**
 * Magic-link claim flow.
 *
 * Status: minimum-viable. There is no SMTP transport configured — the
 * magic link is logged to the server's stderr (visible in `pnpm dev` /
 * container logs). Production-readiness requires:
 *   - swap `deliverMagicLink` for a real email sender;
 *   - rotate WORKER_SHARED_SECRET / SESSION_SECRET separately so the
 *     auth_tokens table doesn't carry secrets across deploys.
 *
 * Threat model:
 *   - Token is 32 random bytes (256 bits), single-use, 30-minute TTL.
 *   - Re-claiming the same email from a different device overwrites the
 *     mapping; this is intentional ("attach this email to my new device").
 *   - We don't enumerate emails on `claim`: every well-formed email
 *     returns 200 to avoid leaking which emails are registered.
 */
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { log } from './logger.js';

export const Email = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  // Deliberately permissive — RFC 5321 allows oddities. We want format
  // sanity, not validation gymnastics.
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'must be a valid email');
export type Email = z.infer<typeof Email>;

export interface MagicLinkPayload {
  email: Email;
  url: string;
  expiresAtMs: number;
}

export interface MagicLinkDelivery {
  deliver(payload: MagicLinkPayload): Promise<void>;
}

/** The default delivery prints the link to the server's stderr. */
export const stderrDelivery: MagicLinkDelivery = {
  async deliver(payload) {
    log.warn('magic link delivery (no SMTP configured)', {
      email: payload.email,
      url: payload.url,
      expiresAt: new Date(payload.expiresAtMs).toISOString(),
    });
  },
};

/** Random 32-byte URL-safe token. */
export function mintToken(): string {
  return randomBytes(32).toString('base64url');
}

export const TOKEN_TTL_MS = 30 * 60_000;
