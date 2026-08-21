/**
 * Shared constants + helpers for attaching files (lecture slides) to
 * /api/extract. Imported by both the route handler and the modal, so
 * keep this module isomorphic — no `node:` imports.
 *
 * Size budget: Vercel caps serverless request bodies at ~4.5 MB, and
 * base64 inflates bytes by 4/3. The caps below keep the worst-case
 * JSON payload (files + notes + encoding overhead) under that limit.
 */

/** MIME types we accept as extract attachments. */
export const EXTRACT_FILE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
] as const;
export type ExtractFileMime = (typeof EXTRACT_FILE_MIME_TYPES)[number];

/** Max number of attachments per extract request. */
export const MAX_EXTRACT_FILES = 4;
/** Max decoded size of a single attachment. */
export const MAX_EXTRACT_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
/** Max decoded size of all attachments combined. */
export const MAX_EXTRACT_TOTAL_BYTES = 3 * 1024 * 1024; // 3 MB
/** Request body cap for /api/extract when attachments are allowed. */
export const MAX_EXTRACT_BODY_BYTES = Math.ceil((MAX_EXTRACT_TOTAL_BYTES * 4) / 3) + 128 * 1024;

/** `accept` attribute value for the file picker. */
export const EXTRACT_FILE_ACCEPT = EXTRACT_FILE_MIME_TYPES.join(',');

export function isExtractFileMime(mime: string): mime is ExtractFileMime {
  return (EXTRACT_FILE_MIME_TYPES as readonly string[]).includes(mime);
}

/**
 * Decoded byte length of a base64 string, computed from its length and
 * padding without decoding. Assumes the string is valid base64 (no
 * whitespace) — validate the alphabet separately.
 */
export function base64ByteLength(b64: string): number {
  if (b64.length === 0) return 0;
  let padding = 0;
  if (b64.endsWith('==')) padding = 2;
  else if (b64.endsWith('=')) padding = 1;
  return (b64.length / 4) * 3 - padding;
}

/** Strict base64 alphabet (standard, not URL-safe; no whitespace). */
export const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export interface ExtractAttachment {
  mediaType: ExtractFileMime;
  /** Raw base64 (no data: prefix, no newlines). */
  data: string;
  /** Display name, client-supplied — never used as a path. */
  name: string;
}
