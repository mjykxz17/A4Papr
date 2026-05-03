'use client';

import { useEffect, useState } from 'react';
import {
  BlockContent,
  type Block,
  type BlockType,
  type CreateBlockInput,
} from '@cheatsheet/shared';
import { api } from '@/lib/api-client';
import { BlockView } from './blocks/BlockView';

/**
 * Output shape from /api/extract — strictly typed and locally narrowed.
 * Keeping the discriminated union here lets the preview render via
 * BlockView without re-validation since we map straight to the
 * zod-enforced BlockContent variants.
 */
type ProposedBlock =
  | {
      type: 'text';
      markdown: string;
      fontSize: 'xs' | 'sm' | 'base';
      align: 'left' | 'center' | 'right';
      tags: string[];
      rationale: string;
    }
  | {
      type: 'formula';
      latex: string;
      displayMode: boolean;
      tags: string[];
      rationale: string;
    }
  | {
      type: 'table';
      headers: string[];
      rows: string[][];
      compact: boolean;
      headerStyle: 'bold' | 'shaded' | 'none';
      tags: string[];
      rationale: string;
    };

interface Props {
  open: boolean;
  onClose: () => void;
  onAdded: (added: Block[]) => void;
}

export function ExtractModal({ open, onClose, onAdded }: Props) {
  const [phase, setPhase] = useState<'input' | 'review'>('input');
  const [text, setText] = useState('');
  const [proposed, setProposed] = useState<ProposedBlock[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<{
    cacheReadTokens: number;
    inputTokens: number;
    outputTokens: number;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      // Don't wipe text — user might re-open and resume
      setError(null);
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  const reset = () => {
    setPhase('input');
    setProposed([]);
    setSelected(new Set());
    setUsage(null);
    setError(null);
  };

  const onGenerate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${body || res.statusText}`);
      }
      const data = (await res.json()) as {
        blocks: ProposedBlock[];
        usage: {
          inputTokens: number;
          cacheReadTokens: number;
          outputTokens: number;
        };
      };
      if (data.blocks.length === 0) {
        setError(
          'The model couldn’t pull useful blocks from these notes. Try pasting more material or denser content.',
        );
        return;
      }
      setProposed(data.blocks);
      setSelected(new Set(data.blocks.map((_, i) => i)));
      setUsage(data.usage);
      setPhase('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'extraction failed');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const onAddSelected = async () => {
    setBusy(true);
    setError(null);
    try {
      const adds: CreateBlockInput[] = [];
      for (const i of selected) {
        const p = proposed[i];
        if (!p) continue;
        const content: BlockContent =
          p.type === 'text'
            ? {
                type: 'text',
                markdown: p.markdown,
                fontSize: p.fontSize,
                align: p.align,
              }
            : p.type === 'formula'
              ? { type: 'formula', latex: p.latex, displayMode: p.displayMode }
              : {
                  type: 'table',
                  headers: p.headers,
                  rows: p.rows,
                  compact: p.compact,
                  headerStyle: p.headerStyle,
                };
        adds.push({ type: p.type as BlockType, content, tags: p.tags });
      }
      const created = await Promise.all(adds.map((input) => api.createBlock(input)));
      onAdded(created);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to add blocks');
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
        className="flex h-[90vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-base font-medium">Generate from notes</h2>
            <p className="mt-1 text-xs text-slate-500">
              Paste lecture notes; Claude proposes blocks; you pick which to keep.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700">
            ✕
          </button>
        </header>

        {phase === 'input' && (
          <div className="flex flex-1 flex-col gap-3 px-4 py-4">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste lecture notes here. Bilingual content is fine — keep it as written."
              className="flex-1 resize-none rounded border border-slate-300 px-3 py-2 font-mono text-sm focus:border-accent focus:outline-none"
            />
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{text.length.toLocaleString()} / 50,000 characters</span>
              {error && <span className="text-red-600">{error}</span>}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                disabled={busy}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={onGenerate}
                disabled={busy || text.trim().length < 20}
                className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
              >
                {busy ? 'Generating…' : 'Generate blocks'}
              </button>
            </div>
          </div>
        )}

        {phase === 'review' && (
          <>
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
              <span>
                {selected.size} of {proposed.length} selected
              </span>
              {usage && (
                <span className="tabular-nums">
                  {usage.inputTokens + usage.cacheReadTokens} in
                  {usage.cacheReadTokens > 0 && ` (${usage.cacheReadTokens} cached)`} ·{' '}
                  {usage.outputTokens} out
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <ul className="space-y-3">
                {proposed.map((p, i) => {
                  const content: BlockContent =
                    p.type === 'text'
                      ? {
                          type: 'text',
                          markdown: p.markdown,
                          fontSize: p.fontSize,
                          align: p.align,
                        }
                      : p.type === 'formula'
                        ? { type: 'formula', latex: p.latex, displayMode: p.displayMode }
                        : {
                            type: 'table',
                            headers: p.headers,
                            rows: p.rows,
                            compact: p.compact,
                            headerStyle: p.headerStyle,
                          };
                  const isSelected = selected.has(i);
                  return (
                    <li
                      key={i}
                      className={`rounded border p-3 ${isSelected ? 'border-accent bg-accent/5' : 'border-slate-200 bg-white'}`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(i)}
                          className="mt-1"
                        />
                        <div className="flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                              {p.type}
                            </span>
                            {p.tags.map((t) => (
                              <span
                                key={t}
                                className="rounded bg-accent/10 px-1.5 py-0.5 text-accent-dark"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                          <div className="rounded border border-slate-100 bg-slate-50/50 p-2">
                            <BlockView content={content} />
                          </div>
                          {p.rationale && (
                            <p className="text-xs italic text-slate-500">{p.rationale}</p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
              <button
                onClick={reset}
                disabled={busy}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                ← Start over
              </button>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  disabled={busy}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={onAddSelected}
                  disabled={busy || selected.size === 0}
                  className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
                >
                  {busy
                    ? 'Adding…'
                    : `Add ${selected.size} block${selected.size === 1 ? '' : 's'} to library`}
                </button>
              </div>
            </footer>
            {error && <p className="px-4 pb-3 text-sm text-red-600">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
