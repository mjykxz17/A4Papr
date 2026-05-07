'use client';

import { useCallback } from 'react';

/**
 * Cookie name set when the user explicitly opts past the mobile gate.
 * The server-side check in `/editor/[id]` honours this cookie so the
 * editor renders on the next navigation. We don't make this hard-fail —
 * tablets and unusual UAs deserve an escape hatch.
 */
export const MOBILE_OVERRIDE_COOKIE = 'cs_mobile_override';

export function MobileGate() {
  const onContinue = useCallback(() => {
    // 30 days, not httpOnly (we want client JS to set it).
    document.cookie = `${MOBILE_OVERRIDE_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    location.reload();
  }, []);

  return (
    <div className="flex h-screen items-center justify-center bg-slate-100 p-6 text-center">
      <div className="max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">View on desktop to edit</h1>
        <p className="text-sm text-slate-600">
          A4 Papr uses drag-and-drop on a precision A4 canvas. Open this page on a desktop browser
          to build your cheatsheet.
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-white"
        >
          Continue anyway
        </button>
      </div>
    </div>
  );
}
