'use client';

import { useEffect, useMemo, useState } from 'react';
import katex from 'katex';
import {
  BlockContent,
  defaultContentFor,
  type Block,
  type BlockType,
  type FormulaBlockContent,
  type ImageBlockContent,
  type TableBlockContent,
  type TextBlockContent,
} from '@cheatsheet/shared';

interface BlockEditorModalProps {
  open: boolean;
  initial: Block | null;
  onCancel: () => void;
  onSave: (input: { type: BlockType; content: BlockContent; tags: string[] }) => Promise<void>;
}

export function BlockEditorModal({ open, initial, onCancel, onSave }: BlockEditorModalProps) {
  const [type, setType] = useState<BlockType>('text');
  const [content, setContent] = useState<BlockContent>(defaultContentFor('text'));
  const [tags, setTags] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setType(initial.type);
      setContent(initial.content);
      setTags(initial.tags.join(', '));
    } else {
      setType('text');
      setContent(defaultContentFor('text'));
      setTags('');
    }
    setError(null);
  }, [open, initial]);

  const onTypeChange = (t: BlockType) => {
    setType(t);
    setContent(defaultContentFor(t));
  };

  const onSubmit = async () => {
    setError(null);
    const parsed = BlockContent.safeParse(content);
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? 'invalid content');
      return;
    }
    setBusy(true);
    try {
      await onSave({
        type,
        content: parsed.data,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-2xl rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-medium">{initial ? 'Edit block' : 'New block'}</h2>
          <button onClick={onCancel} className="text-slate-500 hover:text-slate-700">
            ✕
          </button>
        </header>

        <div className="space-y-4 px-4 py-4">
          {!initial && (
            <div className="flex gap-2">
              {(['text', 'formula', 'table', 'image'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onTypeChange(t)}
                  className={`flex-1 rounded border px-3 py-2 text-sm capitalize ${
                    type === t
                      ? 'border-accent bg-accent/10 text-accent-dark'
                      : 'border-slate-300 hover:border-slate-400'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {content.type === 'text' && <TextEditor content={content} onChange={setContent} />}
          {content.type === 'formula' && <FormulaEditor content={content} onChange={setContent} />}
          {content.type === 'table' && <TableEditor content={content} onChange={setContent} />}
          {content.type === 'image' && <ImageEditor content={content} onChange={setContent} />}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Tags</span>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="comma, separated"
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            onClick={onCancel}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={busy}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function TextEditor({
  content,
  onChange,
}: {
  content: TextBlockContent;
  onChange: (c: TextBlockContent) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-700">
          Markdown <span className="text-slate-400">(bold/italic/lists/code)</span>
        </span>
        <textarea
          value={content.markdown}
          onChange={(e) => onChange({ ...content, markdown: e.target.value })}
          rows={6}
          maxLength={2000}
          className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm focus:border-accent focus:outline-none"
        />
      </label>
      <div className="flex gap-3 text-xs">
        <label>
          Size:
          <select
            value={content.fontSize}
            onChange={(e) =>
              onChange({ ...content, fontSize: e.target.value as TextBlockContent['fontSize'] })
            }
            className="ml-1 rounded border border-slate-300"
          >
            <option value="xs">xs (7pt)</option>
            <option value="sm">sm (8pt)</option>
            <option value="base">base (10pt)</option>
          </select>
        </label>
        <label>
          Align:
          <select
            value={content.align}
            onChange={(e) =>
              onChange({ ...content, align: e.target.value as TextBlockContent['align'] })
            }
            className="ml-1 rounded border border-slate-300"
          >
            <option value="left">left</option>
            <option value="center">center</option>
            <option value="right">right</option>
          </select>
        </label>
      </div>
    </div>
  );
}

function FormulaEditor({
  content,
  onChange,
}: {
  content: FormulaBlockContent;
  onChange: (c: FormulaBlockContent) => void;
}) {
  const errorMsg = useMemo(() => {
    try {
      katex.renderToString(content.latex, {
        displayMode: content.displayMode,
        throwOnError: true,
        strict: 'ignore',
      });
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Invalid LaTeX';
    }
  }, [content.latex, content.displayMode]);

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-700">LaTeX</span>
        <textarea
          value={content.latex}
          onChange={(e) => onChange({ ...content, latex: e.target.value })}
          rows={4}
          maxLength={500}
          placeholder="\\frac{a}{b}"
          className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm focus:border-accent focus:outline-none"
        />
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={content.displayMode}
          onChange={(e) => onChange({ ...content, displayMode: e.target.checked })}
        />
        Display mode (centered, larger)
      </label>
      <FormulaPreview content={content} />
      {errorMsg && <p className="text-xs text-red-600">{errorMsg}</p>}
    </div>
  );
}

function FormulaPreview({ content }: { content: FormulaBlockContent }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!el) return;
    try {
      katex.render(content.latex || '\\,', el, {
        displayMode: content.displayMode,
        throwOnError: false,
        strict: 'ignore',
      });
    } catch {
      el.textContent = '';
    }
  }, [el, content.latex, content.displayMode]);
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-3 text-center">
      <div ref={setEl} />
    </div>
  );
}

function ImageEditor({
  content,
  onChange,
}: {
  content: ImageBlockContent;
  onChange: (c: ImageBlockContent) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPick = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      // Decode locally to get intrinsic width/height before upload.
      const url = URL.createObjectURL(file);
      const dim = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error('not a valid image'));
        img.src = url;
      }).finally(() => URL.revokeObjectURL(url));

      const fd = new FormData();
      fd.append('file', file);
      fd.append('width', String(dim.width));
      fd.append('height', String(dim.height));
      const res = await fetch('/api/uploads', {
        method: 'POST',
        credentials: 'same-origin',
        body: fd,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: unknown };
        throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        url: string;
        width: number;
        height: number;
      };
      onChange({ ...content, url: data.url, width: data.width, height: data.height });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-700">Image file</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onPick(f);
          }}
          className="block w-full text-xs"
        />
      </label>
      {content.url && (
        // Direct <img> is intentional — uploads are user-supplied and
        // we want a small, predictable preview, not Next's optimisation
        // pipeline. The Next image plugin isn't loaded in this project.
        <img
          src={content.url}
          alt={content.alt}
          className="max-h-40 rounded border border-slate-200 bg-slate-50 object-contain"
        />
      )}
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-700">Alt text</span>
        <input
          type="text"
          value={content.alt}
          maxLength={200}
          onChange={(e) => onChange({ ...content, alt: e.target.value })}
          placeholder="Describe the image for screen readers"
          className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-accent focus:outline-none"
        />
      </label>
      {busy && <p className="text-xs text-slate-500">Uploading…</p>}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

function TableEditor({
  content,
  onChange,
}: {
  content: TableBlockContent;
  onChange: (c: TableBlockContent) => void;
}) {
  const setHeader = (i: number, value: string) => {
    const headers = [...content.headers];
    headers[i] = value;
    onChange({ ...content, headers });
  };
  const setCell = (r: number, c: number, value: string) => {
    const rows = content.rows.map((row, ri) =>
      ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row,
    );
    onChange({ ...content, rows });
  };
  const addCol = () => {
    if (content.headers.length >= 12) return;
    onChange({
      ...content,
      headers: [...content.headers, `Col ${content.headers.length + 1}`],
      rows: content.rows.map((r) => [...r, '']),
    });
  };
  const addRow = () => {
    if (content.rows.length >= 30) return;
    onChange({
      ...content,
      rows: [...content.rows, content.headers.map(() => '')],
    });
  };

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded border border-slate-200">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              {content.headers.map((h, i) => (
                <th key={i} className="border-b border-slate-200 p-1">
                  <input
                    value={h}
                    onChange={(e) => setHeader(i, e.target.value)}
                    className="w-full bg-transparent font-semibold focus:outline-none"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {content.rows.map((row, r) => (
              <tr key={r} className="border-b border-slate-200">
                {row.map((cell, c) => (
                  <td key={c} className="p-1">
                    <input
                      value={cell}
                      onChange={(e) => setCell(r, c, e.target.value)}
                      className="w-full bg-transparent focus:outline-none"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          onClick={addRow}
          className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50"
        >
          + row
        </button>
        <button
          type="button"
          onClick={addCol}
          className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50"
        >
          + column
        </button>
        <label>
          Header:
          <select
            value={content.headerStyle}
            onChange={(e) =>
              onChange({
                ...content,
                headerStyle: e.target.value as TableBlockContent['headerStyle'],
              })
            }
            className="ml-1 rounded border border-slate-300"
          >
            <option value="bold">bold</option>
            <option value="shaded">shaded</option>
            <option value="none">none</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={content.compact}
            onChange={(e) => onChange({ ...content, compact: e.target.checked })}
          />
          compact
        </label>
      </div>
    </div>
  );
}
