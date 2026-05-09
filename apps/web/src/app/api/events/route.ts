/**
 * Anonymous events endpoint.
 *
 * Records a product-analytics event for the current device. Rate-limited
 * per-device so a misbehaving client can't spam the table.
 *
 * Body: `{ name: EventName, props?: Record<string, unknown> }`.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createRateLimiter, type RateLimiter } from '@cheatsheet/shared';
import { isKnownEventName, recordEvent } from '@/lib/analytics';
import { readJsonBody } from '@/lib/http';
import { withRoute } from '@/lib/route-helpers';

let _limiter: RateLimiter | undefined;
function limiter(): RateLimiter {
  if (_limiter) return _limiter;
  // Generous: a normal session might fire ~20 events. 60/min/device
  // soaks bursts without leaving headroom for abuse.
  _limiter = createRateLimiter({ capacity: 60, refillPerMinute: 60 });
  return _limiter;
}

const Body = z.object({
  name: z.string().min(1).max(64).refine(isKnownEventName, 'unknown event name'),
  props: z.record(z.string(), z.unknown()).optional(),
});

export const POST = withRoute(async ({ req, deviceId }) => {
  if (!limiter().take(deviceId)) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }
  const body = await readJsonBody(req, { max: 4 * 1024 });
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  await recordEvent(deviceId, parsed.data.name, parsed.data.props ?? {});
  return NextResponse.json({ ok: true });
});

/** Test-only helper: wipe the singleton so a fresh test can swap clocks. */
export function _resetEventsLimiter(): void {
  _limiter = undefined;
}
