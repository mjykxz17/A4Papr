'use client';

import { Fragment, type ReactNode } from 'react';
import type { TextBlockContent } from '@cheatsheet/shared';

const FONT_PT: Record<TextBlockContent['fontSize'], number> = {
  xs: 7,
  sm: 8,
  base: 10,
};

/**
 * Tiny GFM subset, rendered to React nodes (no innerHTML, so no XSS
 * surface). Supports inline `code`, **bold**, *italic* and unordered
 * lists. Anything else falls through as plain text.
 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const inlinePattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  const tokens: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const match of text.matchAll(inlinePattern)) {
    const idx = match.index ?? 0;
    if (idx > last) tokens.push(text.slice(last, idx));
    const m = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (m.startsWith('`')) {
      tokens.push(
        <code key={key} className="rounded bg-slate-100 px-1 font-mono text-[0.95em]">
          {m.slice(1, -1)}
        </code>,
      );
    } else if (m.startsWith('**')) {
      tokens.push(<strong key={key}>{m.slice(2, -2)}</strong>);
    } else {
      tokens.push(<em key={key}>{m.slice(1, -1)}</em>);
    }
    last = idx + m.length;
  }
  if (last < text.length) tokens.push(text.slice(last));
  return tokens;
}

const LIST_ITEM = /^\s*[-*]\s+(.*)$/;

function renderMarkdown(md: string): ReactNode {
  if (!md.trim()) return null;
  const lines = md.split('\n');
  const blocks: ReactNode[] = [];
  let listBuf: string[] | null = null;
  let i = 0;

  const flushList = () => {
    if (listBuf) {
      blocks.push(
        <ul key={`ul-${i++}`} className="list-disc pl-4">
          {listBuf.map((item, idx) => (
            <li key={idx}>{renderInline(item, `li-${idx}`)}</li>
          ))}
        </ul>,
      );
      listBuf = null;
    }
  };

  for (const raw of lines) {
    const m = LIST_ITEM.exec(raw);
    if (m) {
      listBuf ??= [];
      listBuf.push(m[1] ?? '');
      continue;
    }
    flushList();
    if (raw.trim() === '') continue;
    blocks.push(
      <p key={`p-${i++}`}>
        {renderInline(raw, `p-${i}`)}
      </p>,
    );
  }
  flushList();
  return <Fragment>{blocks}</Fragment>;
}

export function TextBlockView({ content }: { content: TextBlockContent }) {
  return (
    <div
      className="h-full w-full overflow-hidden p-1 leading-tight"
      style={{ fontSize: `${FONT_PT[content.fontSize]}pt`, textAlign: content.align }}
    >
      {renderMarkdown(content.markdown)}
    </div>
  );
}
