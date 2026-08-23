'use client';

import { useEffect, useRef } from 'react';
import katex from 'katex';
import type { FormulaBlockContent } from '@cheatsheet/shared';

/**
 * Renders LaTeX via KaTeX's `render` API directly into a div ref —
 * avoids dangerouslySetInnerHTML even though KaTeX output is trusted.
 */
export function FormulaBlockView({ content }: { content: FormulaBlockContent }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(content.latex, ref.current, {
        displayMode: content.displayMode,
        throwOnError: false,
        output: 'html',
        strict: 'ignore',
      });
    } catch {
      ref.current.textContent = 'LaTeX error';
    }
  }, [content.latex, content.displayMode]);

  return (
    <div
      ref={ref}
      className="flex h-full w-full items-center justify-center overflow-hidden p-1"
      // KaTeX sizes in em, so scaling the wrapper font scales the whole
      // formula. --font-scale is the sheet density multiplier.
      style={{ fontSize: 'calc(8pt * var(--font-scale, 1))' }}
    />
  );
}
