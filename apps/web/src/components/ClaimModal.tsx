'use client';

import { useState } from 'react';
import { track } from '@/lib/track';

/**
 * "Save your library" — bind an email to this device so it can be
 * recovered (or shared with another device) via a magic link.
 *
 * Currently the link is logged to the server's stderr (no SMTP). The
 * UI tells the user to check the server log; production deployments
 * should swap in a real email transport.
 */
export function ClaimModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: unknown };
        throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`);
      }
      track('claim_started', {});
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="claim-title"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 id="claim-title" className="text-base font-medium">
            Save your library
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="space-y-3 px-4 py-4 text-sm text-slate-700">
          {!done ? (
            <>
              <p>
                Bind your library to an email so you can restore it on another device. Clearing your
                cookies on this device would otherwise lose it.
              </p>
              <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Heads up: this build does not have an email transport configured. The magic link
                will be printed to the server log (visible in
                <code className="mx-1 rounded bg-amber-100 px-1">pnpm dev</code>
                output).
              </p>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">Email</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-accent focus:outline-none"
                  required
                />
              </label>
              {error && <p className="text-xs text-rose-600">{error}</p>}
            </>
          ) : (
            <p className="text-emerald-700">
              Sent. Check the server log for the magic link, then open it on the device you want to
              bind to this library.
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            onClick={onClose}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            disabled={busy}
          >
            {done ? 'Done' : 'Cancel'}
          </button>
          {!done && (
            <button
              onClick={submit}
              disabled={busy || email.length < 3}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send magic link'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
