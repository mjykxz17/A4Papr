'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Moveable from 'react-moveable';
import { A4, MM_TO_PX, clamp, clampToPage, snapMm } from '@cheatsheet/shared';
import type { Block, BlockPlacement } from '@cheatsheet/shared';
import { BlockView } from './blocks/BlockView';

interface CanvasProps {
  placements: BlockPlacement[];
  blocks: Map<string, Block>;
  zoom: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<BlockPlacement>) => void;
  onCreatePlacement: (blockId: string, xMm: number, yMm: number) => void;
}

const PAGE_WIDTH_PX_AT_100 = A4.widthMm * MM_TO_PX; // ≈ 793.7
const PAGE_HEIGHT_PX_AT_100 = A4.heightMm * MM_TO_PX; // ≈ 1122.5

export function Canvas({
  placements,
  blocks,
  zoom,
  selectedId,
  onSelect,
  onUpdate,
  onCreatePlacement,
}: CanvasProps) {
  const pageRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [moveableTarget, setMoveableTarget] = useState<HTMLElement | null>(null);
  // Bumped after every commit to force Moveable to re-read the DOM rect.
  const [snapVersion, setSnapVersion] = useState(0);

  // Keep Moveable target in sync with selection.
  useEffect(() => {
    if (!selectedId) {
      setMoveableTarget(null);
      return;
    }
    const el = blockRefs.current.get(selectedId);
    setMoveableTarget(el ?? null);
  }, [selectedId, placements]);

  const pageStyle = useMemo<React.CSSProperties>(
    () => ({
      width: PAGE_WIDTH_PX_AT_100 * zoom,
      height: PAGE_HEIGHT_PX_AT_100 * zoom,
      ['--margin-px' as string]: `${A4.marginMm * MM_TO_PX * zoom}px`,
    }),
    [zoom],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const blockId = e.dataTransfer.getData('text/cheatsheet-block-id');
      if (!blockId || !pageRef.current) return;
      const rect = pageRef.current.getBoundingClientRect();
      const xPx = e.clientX - rect.left;
      const yPx = e.clientY - rect.top;
      const xMm = snapMm(xPx / (MM_TO_PX * zoom));
      const yMm = snapMm(yPx / (MM_TO_PX * zoom));
      onCreatePlacement(blockId, xMm, yMm);
    },
    [onCreatePlacement, zoom],
  );

  const allowDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Always preventDefault so the drop event fires. Chrome strips
    // custom MIME types from `types` during dragover for security, so
    // we can't gate on the type here — we check it in handleDrop.
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // Snap alignment targets: every other block's edges + page edges.
  const snapElements = useMemo(() => {
    return placements
      .filter((p) => p.id !== selectedId)
      .map((p) => blockRefs.current.get(p.id))
      .filter((el): el is HTMLDivElement => el != null);
  }, [placements, selectedId, snapVersion]);

  // Deselect when the user mousedowns on the empty page or the gray
  // background — but never when the event came from a block (those
  // stopPropagation in their own handler).
  const onBgMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget || e.target === pageRef.current) {
        onSelect(null);
      }
    },
    [onSelect],
  );

  return (
    <div
      className="relative h-full w-full overflow-auto bg-slate-200"
      onMouseDown={onBgMouseDown}
    >
      <div className="flex min-h-full min-w-full items-start justify-center p-12">
        <div
          ref={pageRef}
          className="a4-page"
          style={pageStyle}
          onDrop={handleDrop}
          onDragOver={allowDrop}
          onMouseDown={onBgMouseDown}
        >
          <div className="a4-margin-guide" />

          {placements.map((p) => {
            const block = blocks.get(p.blockId);
            if (!block) return null;
            return (
              <div
                key={p.id}
                ref={(el) => {
                  if (el) blockRefs.current.set(p.id, el);
                  else blockRefs.current.delete(p.id);
                }}
                className={`canvas-block ${selectedId === p.id ? 'selected' : ''}`}
                style={{
                  left: p.x * MM_TO_PX * zoom,
                  top: p.y * MM_TO_PX * zoom,
                  width: p.width * MM_TO_PX * zoom,
                  height: p.height * MM_TO_PX * zoom,
                  transform: p.rotation ? `rotate(${p.rotation}deg)` : undefined,
                  zIndex: p.zIndex,
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onSelect(p.id);
                }}
              >
                <BlockView content={block.content} />
              </div>
            );
          })}

          {moveableTarget && selectedId && (
            <Moveable
              target={moveableTarget}
              draggable
              resizable
              keepRatio={false}
              throttleDrag={0}
              throttleResize={0}
              edgeDraggable={false}
              renderDirections={['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']}
              snappable
              snapDirections={{ top: true, left: true, bottom: true, right: true, center: true, middle: true }}
              elementSnapDirections={{ top: true, left: true, bottom: true, right: true, center: true, middle: true }}
              snapThreshold={5}
              snapGridWidth={MM_TO_PX * zoom}
              snapGridHeight={MM_TO_PX * zoom}
              elementGuidelines={snapElements}
              snapDigit={0}
              bounds={{
                left: 0,
                top: 0,
                right: PAGE_WIDTH_PX_AT_100 * zoom,
                bottom: PAGE_HEIGHT_PX_AT_100 * zoom,
                position: 'css',
              }}
              onDrag={({ target, beforeTranslate }) => {
                target.style.transform = `translate(${beforeTranslate[0]}px, ${beforeTranslate[1]}px)`;
              }}
              onDragEnd={({ target, isDrag }) => {
                if (!isDrag || !selectedId) return;
                const placement = placements.find((p) => p.id === selectedId);
                if (!placement) return;
                const rect = target.getBoundingClientRect();
                const pageRect = pageRef.current!.getBoundingClientRect();
                const newXMm = snapMm((rect.left - pageRect.left) / (MM_TO_PX * zoom));
                const newYMm = snapMm((rect.top - pageRect.top) / (MM_TO_PX * zoom));
                const clamped = clampToPage(newXMm, newYMm, placement.width, placement.height);
                target.style.transform = placement.rotation
                  ? `rotate(${placement.rotation}deg)`
                  : '';
                onUpdate(selectedId, { x: clamped.x, y: clamped.y });
                setSnapVersion((v) => v + 1);
              }}
              onResize={({ target, width, height, drag }) => {
                target.style.width = `${width}px`;
                target.style.height = `${height}px`;
                target.style.transform = `translate(${drag.beforeTranslate[0]}px, ${drag.beforeTranslate[1]}px)`;
              }}
              onResizeEnd={({ target, lastEvent }) => {
                if (!lastEvent || !selectedId) return;
                const placement = placements.find((p) => p.id === selectedId);
                if (!placement) return;
                const rect = target.getBoundingClientRect();
                const pageRect = pageRef.current!.getBoundingClientRect();
                const newXMm = snapMm((rect.left - pageRect.left) / (MM_TO_PX * zoom));
                const newYMm = snapMm((rect.top - pageRect.top) / (MM_TO_PX * zoom));
                const newWMm = clamp(snapMm(rect.width / (MM_TO_PX * zoom)), 5, A4.widthMm);
                const newHMm = clamp(snapMm(rect.height / (MM_TO_PX * zoom)), 5, A4.heightMm);
                const clamped = clampToPage(newXMm, newYMm, newWMm, newHMm);
                target.style.width = '';
                target.style.height = '';
                target.style.transform = placement.rotation
                  ? `rotate(${placement.rotation}deg)`
                  : '';
                onUpdate(selectedId, {
                  x: clamped.x,
                  y: clamped.y,
                  width: newWMm,
                  height: newHMm,
                });
                setSnapVersion((v) => v + 1);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
