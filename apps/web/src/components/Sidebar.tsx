'use client';

import { useMemo, useState } from 'react';
import type { Block, BlockType } from '@cheatsheet/shared';
import { BlockView } from './blocks/BlockView';

interface SidebarProps {
  library: Block[];
  onNew: () => void;
  onEdit: (block: Block) => void;
  onDelete: (block: Block) => void;
}

const TYPES: Array<BlockType | 'all'> = ['all', 'text', 'formula', 'table'];

export function Sidebar({ library, onNew, onEdit, onDelete }: SidebarProps) {
  const [filter, setFilter] = useState<BlockType | 'all'>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return library.filter((b) => {
      if (filter !== 'all' && b.type !== filter) return false;
      if (!q) return true;
      const haystack = [
        ...b.tags,
        b.type,
        b.content.type === 'text' ? b.content.markdown : '',
        b.content.type === 'formula' ? b.content.latex : '',
        b.content.type === 'table' ? [...b.content.headers, ...b.content.rows.flat()].join(' ') : '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [library, filter, query]);

  return (
    <aside className="editor-chrome flex h-full w-72 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-3">
        <button
          type="button"
          onClick={onNew}
          className="w-full rounded bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-dark"
        >
          + New block
        </button>
      </div>

      <div className="space-y-2 border-b border-slate-200 p-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search blocks…"
          className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-accent focus:outline-none"
        />
        <div className="flex gap-1">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilter(t)}
              className={`rounded-full px-2 py-0.5 text-xs ${
                filter === t
                  ? 'bg-accent text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {filtered.length === 0 && (
          <p className="text-center text-xs text-slate-500">
            {library.length === 0
              ? 'No blocks yet. Click + New block to start.'
              : 'No blocks match this filter.'}
          </p>
        )}
        <ul className="space-y-2">
          {filtered.map((block) => (
            <li
              key={block.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/cheatsheet-block-id', block.id);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              className="group cursor-grab rounded border border-slate-200 bg-white p-2 hover:border-accent"
            >
              <div className="pointer-events-none flex h-20 items-center justify-center overflow-hidden rounded bg-slate-50">
                <div className="origin-top-left scale-50">
                  <BlockView content={block.content} />
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                  {block.type}
                </span>
                <span className="hidden gap-1 group-hover:flex">
                  <button
                    type="button"
                    onClick={() => onEdit(block)}
                    className="text-slate-500 hover:text-accent"
                  >
                    edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(block)}
                    className="text-slate-500 hover:text-red-600"
                  >
                    delete
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
