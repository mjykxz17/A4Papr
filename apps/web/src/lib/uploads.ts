/**
 * Helpers for the /api/uploads route.
 *
 * Storage strategy: content-addressed by SHA-256. Files land at
 * `apps/web/public/uploads/{hash}.{ext}` so Next.js's static file
 * server hands them out for free. The hash is unguessable (256 bits)
 * so URLs are effectively private even though the dir is public.
 *
 * MIME validation is done by sniffing magic bytes — never trust the
 * client-supplied Content-Type. SVG is rejected to avoid script
 * injection through `<script>` tags inside the file.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

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

/** On-disk directory where uploads land. Created on first use. */
export function uploadsDir(): string {
  return path.join(PROJECT_ROOT_FROM_NEXT, 'public', 'uploads');
}

/** Public URL path for a stored upload. */
export function uploadUrl(hash: string, ext: string): string {
  return `${UPLOAD_PUBLIC_PREFIX}/${hash}.${ext}`;
}

/**
 * Store the bytes if they aren't already on disk (deduped by hash).
 * Returns the public URL.
 */
export async function storeImage(bytes: Uint8Array, hash: string, ext: string): Promise<string> {
  const dir = uploadsDir();
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${hash}.${ext}`);
  if (!existsSync(filePath)) {
    await writeFile(filePath, bytes);
  }
  return uploadUrl(hash, ext);
}
