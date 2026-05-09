'use client';

import { useEffect, useState } from 'react';
import { track } from '@/lib/track';

interface Props {
  open: boolean;
  cheatsheetId: string;
  onClose: () => void;
}

/**
 * Share dialog: mints (or reveals) a public slug for the current
 * cheatsheet, displays the resulting URL, and offers a "stop sharing"
 * action that revokes the slug.
 *
 * The mint endpoint is idempotent — repeated POSTs return the same slug
 * — so opening the modal twice on the same cheatsheet is harmless.
 */
export function ShareModal({ open, cheatsheetId, onClose }: Props) {
  const [slug, setSlug] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const mint = async () => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/cheatsheets/${cheatsheetId}/share`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { slug: string };
        if (!cancelled) {
          setSlug(data.slug);
          track('share_minted', { cheatsheetId });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'share failed');
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    void mint();
    return () => {
      cancelled = true;
    };
  }, [open, cheatsheetId]);

  const revoke = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/cheatsheets/${cheatsheetId}/share`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      track('share_revoked', { cheatsheetId });
      setSlug(null);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'revoke failed');
    } finally {
      setBusy(false);
    }
  };

  const url =
    slug && typeof window !== 'undefined' ? `${window.location.origin}/share/${slug}` : '';

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* no clipboard permission — user can still triple-click */
    }
  };

  if (!open) return null;

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
        aria-labelledby="share-title"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 id="share-title" className="text-base font-medium">
            Share this cheatsheet
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
          <p>
            Anyone with this link can view your cheatsheet and fork a copy into their own library.
            They can&apos;t edit your version.
          </p>
          {busy && !slug && <p className="text-xs text-slate-500">Generating link…</p>}
          {url && (
            <div className="flex gap-2">
              <input
                readOnly
                value={url}
                className="flex-1 rounded border border-slate-300 bg-slate-50 px-2 py-1 font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                onClick={copy}
                className="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          )}
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>

        <footer className="flex justify-between border-t border-slate-200 px-4 py-3">
          <button
            onClick={revoke}
            disabled={busy || !slug}
            className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            title="Break the public link. Anyone holding it gets a 404."
          >
            Stop sharing
          </button>
          <button
            onClick={onClose}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dark"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
