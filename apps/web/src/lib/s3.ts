/**
 * Minimal S3-compatible client.
 *
 * Speaks AWS SigV4 — works with AWS S3, Cloudflare R2, MinIO, and any
 * other S3-compatible store. No SDK dependency: 70 lines of node:crypto.
 *
 * Scope: a single `s3PutObject` call with the bytes we already have in
 * memory. We don't stream, don't multipart-upload, don't presign GETs.
 * That's enough for image-block uploads (≤ 5 MB) and keeps the surface
 * tiny.
 *
 * Why not the AWS SDK: it's ~7 MB minified including transitive deps,
 * and we use one verb. Why not aws4fetch: it's nice but adds a dep we
 * can save with `node:crypto` we're already using elsewhere.
 */
import { createHash, createHmac } from 'node:crypto';

export interface S3Config {
  /** Base endpoint, e.g. `https://<account>.r2.cloudflarestorage.com`. */
  endpoint: string;
  /** AWS region. R2 ignores this; pass `'auto'`. */
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface PutArgs {
  key: string;
  body: Uint8Array;
  contentType: string;
}

function sha256Hex(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

/** AWS-style date stamps: `20260507T123456Z` and `20260507`. */
function awsDates(now: Date): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

/**
 * Compute the SigV4 signing key for (date, region, service).
 * Cached neither here nor in callers — once-per-request is cheap.
 */
function deriveSigningKey(
  secret: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

export async function s3PutObject(cfg: S3Config, args: PutArgs): Promise<void> {
  const url = new URL(`/${encodeURIComponent(cfg.bucket)}/${args.key}`, cfg.endpoint);
  const host = url.host;
  const now = new Date();
  const { amzDate, dateStamp } = awsDates(now);
  const payloadHash = sha256Hex(args.body);
  const credentialScope = `${dateStamp}/${cfg.region}/s3/aws4_request`;

  // Canonical request — header keys sorted lower-case; signed headers
  // listed alphabetically.
  const canonicalHeaders =
    `content-type:${args.contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = `PUT\n${url.pathname}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;

  const signingKey = deriveSigningKey(cfg.secretAccessKey, dateStamp, cfg.region, 's3');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const auth =
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'content-type': args.contentType,
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      authorization: auth,
    },
    // Blob is the only Uint8Array-shaped value in the standard BodyInit
    // union; Node's fetch happily streams it back out. The cast is
    // needed because Uint8Array is now generic over ArrayBufferLike
    // (which includes SharedArrayBuffer), but Blob's BlobPart only
    // accepts ArrayBuffer-backed views — at runtime the bytes are
    // identical either way.
    body: new Blob([args.body as Uint8Array<ArrayBuffer>], { type: args.contentType }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`S3 PUT ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
  }
}
