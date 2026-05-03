'use client';

import type { BlockContent } from '@cheatsheet/shared';
import { FormulaBlockView } from './FormulaBlockView';
import { TableBlockView } from './TableBlockView';
import { TextBlockView } from './TextBlockView';

export function BlockView({ content }: { content: BlockContent }) {
  switch (content.type) {
    case 'text':
      return <TextBlockView content={content} />;
    case 'formula':
      return <FormulaBlockView content={content} />;
    case 'table':
      return <TableBlockView content={content} />;
  }
}
