'use client';

import { useMemo, useState } from 'react';
import {
  MM_TO_PX,
  defaultPlacementSize,
  type Block,
  type BlockPlacement,
  type BlockType,
} from '@cheatsheet/shared';
import { BlockView } from './blocks/BlockView';

interface SidebarProps {
  library: Block[];
  placements: BlockPlacement[];
  onNew: () => void;
  onEdit: (block: Block) => void;
  onDelete: (block: Block) => void;
  onGenerateFromNotes?: () => void;
  onContextMenu: (event: { clientX: number; clientY: number; block: Block }) => void;
}

const TYPES: Array<BlockType | 'all'> = ['all', 'text', 'formula', 'table'];

export function Sidebar({
  library,
  placements,
  onNew,
  onEdit,
  onDelete,
  onGenerateFromNotes,
  onContextMenu,
}: SidebarProps) {
  const [filter, setFilter] = useState<BlockType | 'all'>('all');
  const [query, setQuery] = useState('');

  // How many times each block is currently placed on the canvas.
  const placedCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of placements) m.set(p.blockId, (m.get(p.blockId) ?? 0) + 1);
    return m;
  }, [placements]);

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
      <div className="space-y-2 border-b border-slate-200 p-3">
        <button
          type="button"
          onClick={onNew}
          className="w-full rounded bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-dark"
        >
          + New block
        </button>
        {onGenerateFromNotes && (
          <button
            type="button"
            onClick={onGenerateFromNotes}
            className="w-full rounded border border-accent/40 bg-accent/5 px-3 py-2 text-sm font-medium text-accent-dark hover:bg-accent/10"
            title="Paste lecture notes; Claude proposes blocks; you pick which to keep"
          >
            ✨ Generate from notes
          </button>
        )}
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
          {filtered.map((block) => {
            const placedCount = placedCounts.get(block.id) ?? 0;
            const isPlaced = placedCount > 0;
            // Render the preview at the block's natural mm size, then
            // scale to fit the sidebar card width — this matches the
            // canvas's actual proportions instead of the old fixed-height
            // half-scale that lost everything below the fold.
            const PREVIEW_WIDTH_PX = 232;
            const naturalSize = defaultPlacementSize(block.type);
            const naturalWidthPx = naturalSize.width * MM_TO_PX;
            const naturalHeightPx = naturalSize.height * MM_TO_PX;
            const scale = PREVIEW_WIDTH_PX / naturalWidthPx;
            const previewHeightPx = naturalHeightPx * scale;
            return (
              <li
                key={block.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/cheatsheet-block-id', block.id);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onContextMenu({ clientX: e.clientX, clientY: e.clientY, block });
                }}
                className={`group cursor-grab rounded border bg-white p-2 hover:border-accent ${
                  isPlaced ? 'border-accent/60 bg-accent/5' : 'border-slate-200'
                }`}
                title={
                  isPlaced
                    ? `On canvas (${placedCount}× — drag again to add another). Right-click for more options.`
                    : 'Drag onto the canvas to place. Right-click for more options.'
                }
              >
                <div
                  className="pointer-events-none relative overflow-hidden rounded border border-slate-200 bg-white"
                  style={{ height: previewHeightPx }}
                >
                  <div
                    className="absolute left-0 top-0"
                    style={{
                      width: naturalWidthPx,
                      height: naturalHeightPx,
                      transform: `scale(${scale})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    <BlockView content={block.content} />
                  </div>
                  {isPlaced && (
                    <span className="absolute right-1 top-1 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium leading-none text-white">
                      ✓ on canvas{placedCount > 1 ? ` ×${placedCount}` : ''}
                    </span>
                  )}
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
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
