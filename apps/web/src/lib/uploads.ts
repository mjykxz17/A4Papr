/**
 * Image upload helpers.
 *
 * Storage strategy (auto-selected by env):
 *
 *   1. **S3 backend** when `S3_BUCKET` is set. Files are PUT to the
 *      bucket; the returned URL points at `S3_PUBLIC_URL` (or
 *      `${S3_ENDPOINT}/${S3_BUCKET}` if that's not set). Required for
 *      Vercel deploys — Vercel's filesystem is ephemeral.
 *   2. **Filesystem backend** otherwise. Files land at
 *      `apps/web/public/uploads/{hash}.{ext}` so Next.js's static
 *      handler hands them out for free. Good for dev; broken on Vercel.
 *
 * The hash is unguessable (256 bits) so URLs are effectively private
 * even though the dir / bucket is public.
 *
 * MIME validation is done by sniffing magic bytes — never trust the
 * client-supplied Content-Type. SVG is rejected to avoid script
 * injection through `<script>` tags inside the file.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { serverEnv } from './env.js';
import { s3PutObject, type S3Config } from './s3.js';

export const UPLOAD_PUBLIC_PREFIX = '/uploads';
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

export interface SniffedMime {
  mime: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  ext: 'png' | 'jpg' | 'webp' | 'gif';
}

/**
 * Sniff the first few bytes to determine MIME. Returns null for
 * anything we don't accept (incl. SVG).
 */
export function sniffImageMime(bytes: Uint8Array): SniffedMime | null {
  if (bytes.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  // GIF: 47 49 46 38 (GIF8)
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return { mime: 'image/gif', ext: 'gif' };
  }
  // WEBP: "RIFF????WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

export function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const PROJECT_ROOT_FROM_NEXT = path.join(process.cwd());

/** On-disk directory where filesystem-backend uploads land. */
export function uploadsDir(): string {
  return path.join(PROJECT_ROOT_FROM_NEXT, 'public', 'uploads');
}

interface ResolvedS3 {
  config: S3Config;
  publicUrlPrefix: string;
}

/**
 * Pull S3 settings out of the validated env and assert all four
 * secrets are set together. Returns null if storage falls back to FS.
 */
function resolveS3(): ResolvedS3 | null {
  const env = serverEnv();
  if (!env.S3_BUCKET) return null;
  if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    throw new Error(
      'S3_BUCKET is set but S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY are missing — set all four together.',
    );
  }
  const publicUrlPrefix = (env.S3_PUBLIC_URL ?? `${env.S3_ENDPOINT}/${env.S3_BUCKET}`).replace(
    /\/$/,
    '',
  );
  return {
    config: {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    publicUrlPrefix,
  };
}

/**
 * Store the bytes if they aren't already on disk / in the bucket
 * (deduped by hash). Returns the public URL.
 */
export async function storeImage(
  bytes: Uint8Array,
  hash: string,
  ext: string,
  contentType: string,
): Promise<string> {
  const s3 = resolveS3();
  const key = `${hash}.${ext}`;

  if (s3) {
    // R2 / S3: PUT every time. Servers may dedupe; we don't bother
    // doing a HEAD first because a 5 MB upload over a 1 Gbps link is
    // ~50 ms and the round-trip would cost about as much.
    await s3PutObject(s3.config, { key, body: bytes, contentType });
    return `${s3.publicUrlPrefix}/${key}`;
  }

  // Filesystem fallback (local dev only; ephemeral on Vercel).
  const dir = uploadsDir();
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, key);
  if (!existsSync(filePath)) {
    await writeFile(filePath, bytes);
  }
  return `${UPLOAD_PUBLIC_PREFIX}/${key}`;
}
