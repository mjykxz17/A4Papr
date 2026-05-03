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
 * Output shape from /api/extract — locally narrowed so the preview
 * can render via BlockView.
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
  /** When omitted (no API key), the "Generate with Claude" button is hidden. */
  aiAvailable: boolean;
  onClose: () => void;
  onAdded: (added: Block[], opts: { placeOnCanvas: boolean }) => void;
}

const PROMPT_TEMPLATE = `You are converting lecture notes into cheatsheet blocks for a print-ready A4 sheet. Output ONLY a JSON code block (no other text) matching this schema:

\`\`\`json
{
  "blocks": [
    {
      "type": "text",
      "markdown": "<short markdown — bold/italic/code/bullets only, max 200 chars>",
      "fontSize": "sm",
      "align": "left",
      "tags": ["topic", "subtopic"],
      "rationale": "<one short sentence on why this is exam-worthy>"
    },
    {
      "type": "formula",
      "latex": "<KaTeX-compatible LaTeX, no \\\\begin{align}, no custom macros>",
      "displayMode": true,
      "tags": ["topic"],
      "rationale": "..."
    },
    {
      "type": "table",
      "headers": ["..."],
      "rows": [["..."]],
      "compact": true,
      "headerStyle": "bold",
      "tags": ["..."],
      "rationale": "..."
    }
  ]
}
\`\`\`

Rules:
- 6–14 blocks total. ONE concept per block. Skip filler ("important", "remember that", page numbers, slide titles).
- Tables: 2–6 columns, max 15 rows.
- Preserve bilingual content verbatim (e.g. Chinese + English).
- Tag every block with 2–4 short topic tags.

Lecture notes:
[PASTE YOUR NOTES HERE]`;

/**
 * Extract a JSON object from text — accepts a fenced \`\`\`json block,
 * a fenced \`\`\` block, or a bare JSON object as the entire string.
 */
function extractJsonBlock(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  const candidate = fenced ? fenced[1]! : text.trim();
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function isExtractionPayload(v: unknown): v is { blocks: ProposedBlock[] } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'blocks' in v &&
    Array.isArray((v as { blocks: unknown }).blocks)
  );
}

export function ExtractModal({ open, aiAvailable, onClose, onAdded }: Props) {
  const [phase, setPhase] = useState<'input' | 'review'>('input');
  const [text, setText] = useState('');
  const [proposed, setProposed] = useState<ProposedBlock[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showByoTip, setShowByoTip] = useState(!aiAvailable);
  const [usage, setUsage] = useState<{
    cacheReadTokens: number;
    inputTokens: number;
    outputTokens: number;
  } | null>(null);
  const [source, setSource] = useState<'claude' | 'imported'>('claude');

  useEffect(() => {
    if (!open) {
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

  const callClaude = async () => {
    setBusy(true);
    setError(null);
    setSource('claude');
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
        setError('Claude returned no blocks. Try denser notes.');
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

  const importJson = () => {
    setError(null);
    setSource('imported');
    setUsage(null);
    const parsed = extractJsonBlock(text);
    if (!parsed || !isExtractionPayload(parsed)) {
      setError(
        'Couldn’t find a valid blocks JSON. Paste the entire JSON code block your chatbot returned, or use the prompt template above.',
      );
      return;
    }
    if (parsed.blocks.length === 0) {
      setError('JSON contained no blocks.');
      return;
    }
    // Light sanity-check; the server's zod schema would reject malformed
    // content at /api/blocks anyway.
    setProposed(parsed.blocks);
    setSelected(new Set(parsed.blocks.map((_, i) => i)));
    setPhase('review');
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(PROMPT_TEMPLATE);
    } catch {
      /* user can still copy manually from the visible textarea */
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

  const buildContent = (p: ProposedBlock): BlockContent =>
    p.type === 'text'
      ? { type: 'text', markdown: p.markdown, fontSize: p.fontSize, align: p.align }
      : p.type === 'formula'
        ? { type: 'formula', latex: p.latex, displayMode: p.displayMode }
        : {
            type: 'table',
            headers: p.headers,
            rows: p.rows,
            compact: p.compact,
            headerStyle: p.headerStyle,
          };

  const onAdd = async (placeOnCanvas: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const adds: CreateBlockInput[] = [];
      for (const i of selected) {
        const p = proposed[i];
        if (!p) continue;
        adds.push({ type: p.type as BlockType, content: buildContent(p), tags: p.tags });
      }
      const created = await Promise.all(adds.map((input) => api.createBlock(input)));
      onAdded(created, { placeOnCanvas });
      reset();
      setText('');
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
              Paste lecture notes; review proposed blocks; pick which to keep.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700">
            ✕
          </button>
        </header>

        {phase === 'input' && (
          <div className="flex flex-1 flex-col gap-3 px-4 py-4">
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <button
                type="button"
                onClick={() => setShowByoTip((v) => !v)}
                className="flex w-full items-center justify-between text-left font-medium text-slate-700"
              >
                <span>💡 Don’t have an Anthropic API key? Use your own chatbot</span>
                <span className="text-slate-400">{showByoTip ? '▲' : '▼'}</span>
              </button>
              {showByoTip && (
                <div className="mt-2 space-y-2 text-slate-600">
                  <p>
                    Copy the prompt below into ChatGPT, Claude.ai, Gemini, or any other
                    chatbot, replace the bracketed placeholder with your notes, then paste
                    the chatbot’s entire JSON output back into the textarea here and press{' '}
                    <strong>Import JSON</strong>.
                  </p>
                  <div className="relative">
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-white p-2 font-mono text-[11px] leading-relaxed text-slate-700">
                      {PROMPT_TEMPLATE}
                    </pre>
                    <button
                      type="button"
                      onClick={copyPrompt}
                      className="absolute right-1 top-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] hover:bg-slate-50"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
            </div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste lecture notes (raw text), or the JSON your chatbot produced from the prompt above."
              className="flex-1 resize-none rounded border border-slate-300 px-3 py-2 font-mono text-sm focus:border-accent focus:outline-none"
            />
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{text.length.toLocaleString()} / 50,000 characters</span>
              {error && <span className="text-red-600">{error}</span>}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={onClose}
                disabled={busy}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={importJson}
                disabled={busy || text.trim().length < 20}
                className="rounded border border-accent bg-white px-3 py-1.5 text-sm font-medium text-accent-dark hover:bg-accent/5"
                title="Parse a JSON code block produced by your own chatbot"
              >
                Import JSON
              </button>
              {aiAvailable && (
                <button
                  onClick={callClaude}
                  disabled={busy || text.trim().length < 20}
                  className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
                >
                  {busy ? 'Generating…' : 'Generate with Claude'}
                </button>
              )}
            </div>
          </div>
        )}

        {phase === 'review' && (
          <>
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
              <span>
                {selected.size} of {proposed.length} selected
                {source === 'imported' && (
                  <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px]">
                    imported
                  </span>
                )}
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
                  const content = buildContent(p);
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
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  onClick={onClose}
                  disabled={busy}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => onAdd(false)}
                  disabled={busy || selected.size === 0}
                  className="rounded border border-accent px-3 py-1.5 text-sm font-medium text-accent-dark hover:bg-accent/5 disabled:opacity-50"
                >
                  {busy ? 'Adding…' : `Add ${selected.size} to library`}
                </button>
                <button
                  onClick={() => onAdd(true)}
                  disabled={busy || selected.size === 0}
                  className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
                  title="Adds to library AND auto-arranges them on the cheatsheet"
                >
                  {busy ? '…' : `Add + place ${selected.size} on canvas`}
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
