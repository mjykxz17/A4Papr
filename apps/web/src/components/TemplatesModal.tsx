'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TEMPLATES, type Template } from '@/lib/templates';
import { track } from '@/lib/track';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Templates picker. Cards drive `/api/templates/{id}/fork` and redirect
 * the user into the new cheatsheet on success. Templates ship as a
 * code constant (see `lib/templates.ts`); the picker just enumerates
 * them with a "Use this template" button each.
 */
export function TemplatesModal({ open, onClose }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const fork = async (tpl: Template) => {
    setBusy(tpl.id);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${tpl.id}/fork`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: unknown };
        throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`);
      }
      const { id } = (await res.json()) as { id: string };
      track('template_forked', { templateId: tpl.id });
      router.push(`/editor/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fork failed');
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tpl-title"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 id="tpl-title" className="text-base font-medium">
            Start from a template
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="grid max-h-[70vh] gap-3 overflow-y-auto p-4 sm:grid-cols-2">
          {TEMPLATES.map((tpl) => {
            const inFlight = busy === tpl.id;
            return (
              <article
                key={tpl.id}
                className="flex flex-col rounded border border-slate-200 p-4 hover:border-slate-300"
              >
                <h3 className="text-sm font-semibold text-slate-900">{tpl.name}</h3>
                <p className="mt-1 text-xs text-slate-600">{tpl.description}</p>
                <p className="mt-2 text-xs text-slate-400">
                  {tpl.blocks.length} blocks · {tpl.audience}
                </p>
                <button
                  onClick={() => fork(tpl)}
                  disabled={busy !== null}
                  className="mt-3 self-start rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-dark disabled:opacity-50"
                >
                  {inFlight ? 'Creating…' : 'Use this template'}
                </button>
              </article>
            );
          })}
        </div>

        {error && (
          <p className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">
            {error}
          </p>
        )}

        <footer className="flex justify-end border-t border-slate-200 px-4 py-3">
          <button
            onClick={onClose}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
