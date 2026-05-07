/**
 * Image upload endpoint.
 *
 *   POST /api/uploads
 *     multipart/form-data
 *       file:   the image (≤ 5 MB)
 *       width:  intrinsic width in px (number)
 *       height: intrinsic height in px (number)
 *
 *   200 → { url, mime, width, height }
 *
 * Hardening:
 *   - Body cap = 5 MB (cap is checked before reading the stream).
 *   - MIME inferred from magic bytes; SVG and other types are rejected.
 *   - Content-addressed by SHA-256 → automatic deduplication.
 *   - Ownership recorded in image_uploads so cleanup / quota are tractable.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb, imageUploads } from '@cheatsheet/db';
import { withRoute } from '@/lib/route-helpers';
import { hashBytes, MAX_UPLOAD_BYTES, sniffImageMime, storeImage } from '@/lib/uploads';

export const runtime = 'nodejs';

const Dimension = z.coerce.number().int().positive().max(20_000);

export const POST = withRoute(async ({ req, deviceId, logger }) => {
  // Cap by Content-Length first so we don't even read the stream if it's
  // obviously too big. Accept a small pad above the byte limit because
  // multipart wrapping adds a few KB.
  const cl = req.headers.get('content-length');
  if (cl && Number(cl) > MAX_UPLOAD_BYTES + 64 * 1024) {
    return NextResponse.json({ error: 'file too large' }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid multipart body' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'missing file' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'file too large' }, { status: 413 });
  }

  const widthRaw = form.get('width');
  const heightRaw = form.get('height');
  const width = Dimension.safeParse(widthRaw);
  const height = Dimension.safeParse(heightRaw);
  if (!width.success || !height.success) {
    return NextResponse.json({ error: 'width/height must be positive integers' }, { status: 400 });
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImageMime(buf);
  if (!sniffed) {
    return NextResponse.json(
      { error: 'unsupported image type (PNG, JPEG, GIF, WEBP only)' },
      { status: 415 },
    );
  }

  const hash = hashBytes(buf);
  const url = await storeImage(buf, hash, sniffed.ext);

  // Record ownership; on hash collision (re-upload of the same bytes
  // by the same device) the row already exists — ignore.
  try {
    await getDb()
      .insert(imageUploads)
      .values({
        hash,
        deviceId,
        mime: sniffed.mime,
        bytes: buf.byteLength,
        width: width.data,
        height: height.data,
      })
      .onConflictDoNothing();
  } catch (err) {
    logger.error('image_uploads insert failed', { err: String(err) });
  }

  logger.info('image uploaded', { hash, mime: sniffed.mime, bytes: buf.byteLength });

  return NextResponse.json({
    url,
    mime: sniffed.mime,
    width: width.data,
    height: height.data,
  });
});
