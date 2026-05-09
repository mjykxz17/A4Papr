'use client';

/**
 * Client-side event tracker. Fire and forget — failures are silently
 * swallowed because product analytics must never break a user action.
 *
 * Use the typed `track('foo')` helper; the server validates the name
 * against an allowlist (see `analytics.ts`).
 */
import type { EventName } from './analytics.js';

export function track(name: EventName, props: Record<string, unknown> = {}): void {
  // sendBeacon is preferred because it survives page navigations
  // (the user clicks "Export", we want to record the click even if
  // the response triggers a download that aborts the page).
  const body = JSON.stringify({ name, props });
  try {
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = navigator.sendBeacon('/api/events', blob);
      if (ok) return;
    }
  } catch {
    // fall through to fetch
  }
  // Fallback: fetch with keepalive so the request still goes if the
  // page is unloading.
  void fetch('/api/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    credentials: 'same-origin',
    keepalive: true,
  }).catch(() => {});
}
