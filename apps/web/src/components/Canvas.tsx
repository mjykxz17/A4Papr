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

/**
 * Canvas block positioning uses transform-only translates (top/left
 * stay at 0). This is the canonical react-moveable pattern: Moveable
 * computes its frame from the target's transform, so positioning the
 * element with CSS top/left causes its internal frame to go stale on
 * every state update. With transform-only, drag and resize stay
 * coherent across re-renders.
 */
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
  const [snapVersion, setSnapVersion] = useState(0);

  // Resolve the selected target ref to an HTMLElement for Moveable.
  useEffect(() => {
    if (!selectedId) {
      setMoveableTarget(null);
      return;
    }
    const el = blockRefs.current.get(selectedId);
    setMoveableTarget(el ?? null);
  }, [selectedId, placements]);

  const pxPerMm = MM_TO_PX * zoom;

  const pageStyle = useMemo<React.CSSProperties>(
    () => ({
      width: PAGE_WIDTH_PX_AT_100 * zoom,
      height: PAGE_HEIGHT_PX_AT_100 * zoom,
      ['--margin-px' as string]: `${A4.marginMm * pxPerMm}px`,
    }),
    [zoom, pxPerMm],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const blockId = e.dataTransfer.getData('text/cheatsheet-block-id');
      if (!blockId || !pageRef.current) return;
      const rect = pageRef.current.getBoundingClientRect();
      const xMm = snapMm((e.clientX - rect.left) / pxPerMm);
      const yMm = snapMm((e.clientY - rect.top) / pxPerMm);
      onCreatePlacement(blockId, xMm, yMm);
    },
    [onCreatePlacement, pxPerMm],
  );

  const allowDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onBgMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget || e.target === pageRef.current) {
        onSelect(null);
      }
    },
    [onSelect],
  );

  // Snap alignment targets: every other block. snapVersion bumps when
  // a placement settles so Moveable re-reads positions.
  const snapElements = useMemo(() => {
    return placements
      .filter((p) => p.id !== selectedId)
      .map((p) => blockRefs.current.get(p.id))
      .filter((el): el is HTMLDivElement => el != null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placements, selectedId, snapVersion]);

  const selectedPlacement = useMemo(
    () => (selectedId ? placements.find((p) => p.id === selectedId) ?? null : null),
    [selectedId, placements],
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
            const tx = p.x * pxPerMm;
            const ty = p.y * pxPerMm;
            return (
              <div
                key={p.id}
                ref={(el) => {
                  if (el) blockRefs.current.set(p.id, el);
                  else blockRefs.current.delete(p.id);
                }}
                className={`canvas-block ${selectedId === p.id ? 'selected' : ''}`}
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                onContextMenu={(e) => e.preventDefault()}
                style={{
                  width: p.width * pxPerMm,
                  height: p.height * pxPerMm,
                  transform: `translate(${tx}px, ${ty}px)${p.rotation ? ` rotate(${p.rotation}deg)` : ''}`,
                  zIndex: p.zIndex,
                  // No top/left — transform-only positioning so Moveable's
                  // frame matches the target's actual visual rect.
                  top: 0,
                  left: 0,
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

          {moveableTarget && selectedPlacement && (
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
              snapDirections={{
                top: true,
                left: true,
                bottom: true,
                right: true,
                center: true,
                middle: true,
              }}
              elementSnapDirections={{
                top: true,
                left: true,
                bottom: true,
                right: true,
                center: true,
                middle: true,
              }}
              snapThreshold={5}
              snapGridWidth={pxPerMm}
              snapGridHeight={pxPerMm}
              elementGuidelines={snapElements}
              /* ---------- drag ---------- */
              onDrag={({ target, transform }) => {
                target.style.transform = transform;
              }}
              onDragEnd={({ target, isDrag, lastEvent }) => {
                if (!isDrag || !lastEvent) {
                  // Drag interrupted (e.g. macOS force-click preempting).
                  // Reset the inline transform back to React's source of
                  // truth so the block snaps to its committed position
                  // rather than wherever Moveable last left it.
                  target.style.transform = `translate(${selectedPlacement.x * pxPerMm}px, ${selectedPlacement.y * pxPerMm}px)${
                    selectedPlacement.rotation ? ` rotate(${selectedPlacement.rotation}deg)` : ''
                  }`;
                  return;
                }
                const [pxX, pxY] = lastEvent.beforeTranslate as [number, number];
                if (!Number.isFinite(pxX) || !Number.isFinite(pxY)) return;
                const newXMm = snapMm(pxX / pxPerMm);
                const newYMm = snapMm(pxY / pxPerMm);
                const clamped = clampToPage(
                  newXMm,
                  newYMm,
                  selectedPlacement.width,
                  selectedPlacement.height,
                );
                onUpdate(selectedPlacement.id, { x: clamped.x, y: clamped.y });
                setSnapVersion((v) => v + 1);
              }}
              /* ---------- resize ---------- */
              /* No onResizeStart needed — Moveable derives origin
                 from the dragged handle so the opposite corner stays
                 anchored. */
              onResize={({ target, width, height, drag }) => {
                target.style.width = `${width}px`;
                target.style.height = `${height}px`;
                target.style.transform = drag.transform;
              }}
              onResizeEnd={({ target, isDrag, lastEvent }) => {
                if (!isDrag || !lastEvent) {
                  target.style.width = `${selectedPlacement.width * pxPerMm}px`;
                  target.style.height = `${selectedPlacement.height * pxPerMm}px`;
                  target.style.transform = `translate(${selectedPlacement.x * pxPerMm}px, ${selectedPlacement.y * pxPerMm}px)${
                    selectedPlacement.rotation ? ` rotate(${selectedPlacement.rotation}deg)` : ''
                  }`;
                  return;
                }
                const w = lastEvent.width as number;
                const h = lastEvent.height as number;
                const [pxX, pxY] = lastEvent.drag.beforeTranslate as [number, number];
                if (
                  !Number.isFinite(w) ||
                  !Number.isFinite(h) ||
                  !Number.isFinite(pxX) ||
                  !Number.isFinite(pxY)
                ) {
                  return;
                }
                const newXMm = snapMm(pxX / pxPerMm);
                const newYMm = snapMm(pxY / pxPerMm);
                const newWMm = clamp(snapMm(w / pxPerMm), 5, A4.widthMm);
                const newHMm = clamp(snapMm(h / pxPerMm), 5, A4.heightMm);
                const clamped = clampToPage(newXMm, newYMm, newWMm, newHMm);
                onUpdate(selectedPlacement.id, {
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
