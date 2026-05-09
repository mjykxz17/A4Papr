'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { A4, MM_TO_PX, type Block, type BlockPlacement } from '@cheatsheet/shared';
import { BlockView } from '@/components/blocks/BlockView';
import { track } from '@/lib/track';

interface Props {
  slug: string;
  title: string;
  blocks: Block[];
  placements: BlockPlacement[];
}

const PAGE_WIDTH_PX = A4.widthMm * MM_TO_PX;
const PAGE_HEIGHT_PX = A4.heightMm * MM_TO_PX;

/**
 * Read-only public render. No drag, no resize, no Moveable — just an
 * A4 page with its placements rendered exactly. The fork button is the
 * only mutating action, and it requires the visitor's own device cookie
 * (minted automatically on first request by middleware).
 */
export function SharePageClient({ slug, title, blocks, placements }: Props) {
  const router = useRouter();
  const [forking, setForking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocksById = new Map<string, Block>();
  for (const b of blocks) blocksById.set(b.id, b);

  const fork = async () => {
    setForking(true);
    setError(null);
    try {
      const res = await fetch(`/api/share/${slug}/fork`, {
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
      track('share_forked', { slug });
      router.push(`/editor/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fork failed');
      setForking(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-3">
        <h1 className="text-base font-semibold text-slate-900">A4 Papr</h1>
        <span className="text-sm text-slate-500">·</span>
        <span className="truncate text-sm text-slate-700">{title}</span>
        <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
          shared, read-only
        </span>
        <button
          onClick={fork}
          disabled={forking}
          className="ml-auto rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
        >
          {forking ? 'Forking…' : 'Fork to my library'}
        </button>
      </header>

      {error && (
        <div className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <main className="flex flex-1 items-start justify-center overflow-auto p-8">
        <div
          className="a4-page"
          style={{ width: PAGE_WIDTH_PX, height: PAGE_HEIGHT_PX }}
          aria-label={`Cheatsheet ${title}`}
        >
          <div className="a4-margin-guide" />
          {placements.map((p) => {
            const block = blocksById.get(p.blockId);
            if (!block) return null;
            const tx = p.x * MM_TO_PX;
            const ty = p.y * MM_TO_PX;
            return (
              <div
                key={p.id}
                className="canvas-block"
                style={{
                  width: p.width * MM_TO_PX,
                  height: p.height * MM_TO_PX,
                  transform: `translate(${tx}px, ${ty}px)${p.rotation ? ` rotate(${p.rotation}deg)` : ''}`,
                  zIndex: p.zIndex,
                  top: 0,
                  left: 0,
                  pointerEvents: 'none',
                }}
              >
                <div className="canvas-block-inner" style={{ width: '100%', height: '100%' }}>
                  <BlockView content={block.content} />
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
