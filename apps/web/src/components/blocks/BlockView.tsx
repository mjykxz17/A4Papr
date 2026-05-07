'use client';

import type { BlockContent } from '@cheatsheet/shared';
import { FormulaBlockView } from './FormulaBlockView';
import { ImageBlockView } from './ImageBlockView';
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
    case 'image':
      return <ImageBlockView content={content} />;
  }
}
