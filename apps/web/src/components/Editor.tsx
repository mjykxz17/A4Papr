'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  defaultPlacementSize,
  layoutPlacements,
  type Block,
  type BlockContent,
  type BlockPlacement,
  type BlockType,
  type Cheatsheet,
  type PlacementPatch,
} from '@cheatsheet/shared';
import { api } from '@/lib/api-client';
import { useDebouncedCallback, useIsMobile, useUndoStack } from '@/lib/hooks';
import { BlockEditorModal } from './BlockEditorModal';
import { CalibrationModal, readCalibration } from './CalibrationModal';
import { Canvas } from './Canvas';
import { ContextMenu, type ContextMenuEntry } from './ContextMenu';
import { ExtractModal } from './ExtractModal';
import { MobileGate } from './MobileGate';
import { Sidebar } from './Sidebar';
import { Toolbar } from './Toolbar';

type SaveStatus = 'saved' | 'saving' | 'dirty' | 'error';

interface EditorProps {
  cheatsheet: Cheatsheet;
  initialPlacements: BlockPlacement[];
  initialLibrary: Block[];
  aiEnabled: boolean;
}

interface PendingPatch {
  upserts: Map<string, BlockPlacement>; // key: placement.id (real UUID)
  deletes: Set<string>;
}

function newPendingPatch(): PendingPatch {
  return { upserts: new Map(), deletes: new Set() };
}

export function Editor({
  cheatsheet,
  initialPlacements,
  initialLibrary,
  aiEnabled,
}: EditorProps) {
  const isMobile = useIsMobile();

  const [library, setLibrary] = useState<Block[]>(initialLibrary);
  const undo = useUndoStack<BlockPlacement[]>({ initial: initialPlacements });
  const placements = undo.state;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [title, setTitle] = useState(cheatsheet.title);
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [extractOpen, setExtractOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [contextMenu, setContextMenu] = useState<
    | { kind: 'placement'; x: number; y: number; placementId: string }
    | { kind: 'libraryBlock'; x: number; y: number; blockId: string }
    | null
  >(null);

  const onActualSize = useCallback(() => {
    setZoom(readCalibration());
  }, []);

  const pendingRef = useRef<PendingPatch>(newPendingPatch());

  const blocksById = useMemo(() => {
    const m = new Map<string, Block>();
    for (const b of library) m.set(b.id, b);
    return m;
  }, [library]);

  /* ---------------------- placement mutations ---------------------- */

  const queueUpsert = useCallback((p: BlockPlacement) => {
    pendingRef.current.upserts.set(p.id, p);
    setSaveStatus('dirty');
  }, []);
  const queueDelete = useCallback((id: string) => {
    pendingRef.current.upserts.delete(id);
    pendingRef.current.deletes.add(id);
    setSaveStatus('dirty');
  }, []);

  const updatePlacement = useCallback(
    (id: string, patch: Partial<BlockPlacement>) => {
      undo.set((prev) => {
        const next = prev.map((p) => (p.id === id ? { ...p, ...patch } : p));
        const updated = next.find((p) => p.id === id);
        if (updated) queueUpsert(updated);
        return next;
      });
    },
    [undo, queueUpsert],
  );

  const createPlacement = useCallback(
    (blockId: string, xMm: number, yMm: number) => {
      const block = blocksById.get(blockId);
      if (!block) return;
      const size = defaultPlacementSize(block.type);
      const id = crypto.randomUUID();
      const placement: BlockPlacement = {
        id,
        cheatsheetId: cheatsheet.id,
        blockId,
        x: xMm,
        y: yMm,
        width: size.width,
        height: size.height,
        rotation: 0,
        zIndex: (placements.at(-1)?.zIndex ?? 0) + 1,
      };
      undo.set((prev) => [...prev, placement]);
      queueUpsert(placement);
      setSelectedId(id);
    },
    [blocksById, cheatsheet.id, placements, undo, queueUpsert],
  );

  const duplicateSelected = useCallback(() => {
    if (!selectedId) return;
    const src = placements.find((p) => p.id === selectedId);
    if (!src) return;
    const id = crypto.randomUUID();
    const copy: BlockPlacement = {
      ...src,
      id,
      x: src.x + 5,
      y: src.y + 5,
      zIndex: (placements.at(-1)?.zIndex ?? 0) + 1,
    };
    undo.set((prev) => [...prev, copy]);
    queueUpsert(copy);
    setSelectedId(id);
  }, [selectedId, placements, undo, queueUpsert]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    undo.set((prev) => prev.filter((p) => p.id !== selectedId));
    queueDelete(selectedId);
    setSelectedId(null);
  }, [selectedId, undo, queueDelete]);

  const bringToFront = useCallback(
    (id: string) => {
      const maxZ = placements.reduce((m, p) => Math.max(m, p.zIndex), 0);
      const target = placements.find((p) => p.id === id);
      if (!target || target.zIndex === maxZ) return;
      const next: BlockPlacement = { ...target, zIndex: maxZ + 1 };
      undo.set((prev) => prev.map((p) => (p.id === id ? next : p)));
      queueUpsert(next);
    },
    [placements, undo, queueUpsert],
  );

  const sendToBack = useCallback(
    (id: string) => {
      const minZ = placements.reduce((m, p) => Math.min(m, p.zIndex), Infinity);
      const target = placements.find((p) => p.id === id);
      if (!target || target.zIndex === minZ) return;
      const next: BlockPlacement = {
        ...target,
        zIndex: Math.max(0, minZ - 1),
      };
      undo.set((prev) => prev.map((p) => (p.id === id ? next : p)));
      queueUpsert(next);
    },
    [placements, undo, queueUpsert],
  );

  /* ---------------------- auto-save ---------------------- */

  const flushPending = useCallback(async () => {
    const pending = pendingRef.current;
    if (pending.upserts.size === 0 && pending.deletes.size === 0) {
      setSaveStatus('saved');
      return;
    }
    pendingRef.current = newPendingPatch();
    setSaveStatus('saving');

    const patch: PlacementPatch = {
      upserts: [...pending.upserts.values()].map((p) => ({
        id: p.id,
        blockId: p.blockId,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
        rotation: p.rotation,
        zIndex: p.zIndex,
      })),
      deletes: [...pending.deletes],
    };

    try {
      await api.patchPlacements(cheatsheet.id, patch);
      setSaveStatus('saved');
    } catch (e) {
      console.error('save failed', e);
      // Re-queue: merge back so we don't lose the writes
      for (const [id, p] of pending.upserts) pendingRef.current.upserts.set(id, p);
      for (const id of pending.deletes) pendingRef.current.deletes.add(id);
      setSaveStatus('error');
    }
  }, [cheatsheet.id]);

  const debouncedFlush = useDebouncedCallback(flushPending, 500);

  useEffect(() => {
    if (saveStatus === 'dirty') debouncedFlush();
  }, [saveStatus, debouncedFlush]);

  // Flush on tab close
  useEffect(() => {
    const onBeforeUnload = () => {
      const p = pendingRef.current;
      if (p.upserts.size > 0 || p.deletes.size > 0) {
        const patch = JSON.stringify({
          upserts: [...p.upserts.values()].map((pp) => ({
            id: pp.id,
            blockId: pp.blockId,
            x: pp.x,
            y: pp.y,
            width: pp.width,
            height: pp.height,
            rotation: pp.rotation,
            zIndex: pp.zIndex,
          })),
          deletes: [...p.deletes],
        });
        navigator.sendBeacon(
          `/api/cheatsheets/${cheatsheet.id}/placements`,
          new Blob([patch], { type: 'application/json' }),
        );
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [cheatsheet.id]);

  /* ---------------------- library mutations ---------------------- */

  const onSaveBlock = useCallback(
    async (input: { type: BlockType; content: BlockContent; tags: string[] }) => {
      if (editingBlock) {
        const updated = await api.updateBlock(editingBlock.id, {
          content: input.content,
          tags: input.tags,
        });
        setLibrary((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      } else {
        const created = await api.createBlock(input);
        setLibrary((prev) => [...prev, created]);
      }
      setModalOpen(false);
      setEditingBlock(null);
    },
    [editingBlock],
  );

  const onDeleteBlock = useCallback(
    async (block: Block) => {
      if (!confirm(`Delete "${block.type}" block? Placements on this cheatsheet will be removed.`))
        return;
      await api.deleteBlock(block.id);
      setLibrary((prev) => prev.filter((b) => b.id !== block.id));
      // remove any placements referencing it
      const removed = placements.filter((p) => p.blockId === block.id);
      if (removed.length > 0) {
        undo.set((prev) => prev.filter((p) => p.blockId !== block.id));
        for (const p of removed) queueDelete(p.id);
      }
    },
    [placements, undo, queueDelete],
  );

  /* ---------------------- export ---------------------- */

  const onExport = useCallback(async () => {
    setExporting(true);
    try {
      // ensure latest changes are saved first
      await flushPending();
      const blob = await api.exportPdf(cheatsheet.id);
      const url = URL.createObjectURL(blob);
      const today = new Date().toISOString().slice(0, 10).replaceAll('-', '');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[^\p{L}\p{N}]+/gu, '_') || 'cheatsheet'}_${today}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('export failed', e);
      alert(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }, [flushPending, cheatsheet.id, title]);

  /* ---------------------- keyboard ---------------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // ignore typing in inputs/textareas
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const meta = e.metaKey || e.ctrlKey;

      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (selectedId) {
          e.preventDefault();
          deleteSelected();
        }
      } else if (meta && e.key.toLowerCase() === 'd') {
        if (selectedId) {
          e.preventDefault();
          duplicateSelected();
        }
      } else if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) undo.redo();
        else undo.undo();
      } else if (meta && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        setZoom((z) => Math.min(4, Math.round((z + 0.1) * 10) / 10));
      } else if (meta && e.key === '-') {
        e.preventDefault();
        setZoom((z) => Math.max(0.25, Math.round((z - 0.1) * 10) / 10));
      } else if (meta && e.key === '0') {
        e.preventDefault();
        setZoom(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, deleteSelected, duplicateSelected, undo]);

  /* ---------------------- title save (debounced) ---------------------- */

  const debouncedTitleSave = useDebouncedCallback(async (next: string) => {
    try {
      await fetch(`/api/cheatsheets/${cheatsheet.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: next }),
      });
    } catch (e) {
      console.error('title save failed', e);
    }
  }, 800);

  const onTitleChange = useCallback(
    (next: string) => {
      setTitle(next);
      debouncedTitleSave(next);
    },
    [debouncedTitleSave],
  );

  if (isMobile) return <MobileGate />;

  return (
    <div className="flex h-screen flex-col">
      <Toolbar
        title={title}
        onTitleChange={onTitleChange}
        zoom={zoom}
        onZoomChange={setZoom}
        onActualSize={onActualSize}
        onCalibrate={() => setCalibrationOpen(true)}
        onUndo={undo.undo}
        onRedo={undo.redo}
        canUndo={undo.canUndo}
        canRedo={undo.canRedo}
        onExport={onExport}
        exporting={exporting}
        saveStatus={saveStatus}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          library={library}
          placements={placements}
          onNew={() => {
            setEditingBlock(null);
            setModalOpen(true);
          }}
          onEdit={(b) => {
            setEditingBlock(b);
            setModalOpen(true);
          }}
          onDelete={onDeleteBlock}
          onGenerateFromNotes={() => setExtractOpen(true)}
          onContextMenu={({ clientX, clientY, block }) =>
            setContextMenu({ kind: 'libraryBlock', x: clientX, y: clientY, blockId: block.id })
          }
        />
        <main className="flex-1 overflow-hidden">
          <Canvas
            placements={placements}
            blocks={blocksById}
            zoom={zoom}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onUpdate={updatePlacement}
            onCreatePlacement={createPlacement}
            onContextMenu={({ clientX, clientY, placementId }) =>
              setContextMenu({ kind: 'placement', x: clientX, y: clientY, placementId })
            }
            onEditBlock={(block) => {
              setEditingBlock(block);
              setModalOpen(true);
            }}
          />
        </main>
      </div>

      <BlockEditorModal
        open={modalOpen}
        initial={editingBlock}
        onCancel={() => {
          setModalOpen(false);
          setEditingBlock(null);
        }}
        onSave={onSaveBlock}
      />

      <CalibrationModal
        open={calibrationOpen}
        onClose={() => setCalibrationOpen(false)}
        onSaved={(factor) => setZoom(factor)}
      />

      <ExtractModal
        open={extractOpen}
        aiAvailable={aiEnabled}
        onClose={() => setExtractOpen(false)}
        onAdded={(added, opts) => {
          setLibrary((prev) => [...prev, ...added]);
          if (!opts.placeOnCanvas || added.length === 0) return;
          // Bin-pack the new blocks into the A4 page below anything
          // already there, then queue each as a placement upsert so
          // auto-save persists them on the next debounce tick.
          const boxes = layoutPlacements(
            added.map((b) => ({ type: b.type })),
            placements,
          );
          const baseZ = (placements.at(-1)?.zIndex ?? 0) + 1;
          const newPlacements: BlockPlacement[] = added.map((block, i) => {
            const box = boxes[i]!;
            return {
              id: crypto.randomUUID(),
              cheatsheetId: cheatsheet.id,
              blockId: block.id,
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
              rotation: 0,
              zIndex: baseZ + i,
            };
          });
          undo.set((prev) => [...prev, ...newPlacements]);
          for (const p of newPlacements) queueUpsert(p);
        }}
      />

      {contextMenu && (() => {
        let items: ContextMenuEntry[] = [];
        if (contextMenu.kind === 'placement') {
          const placement = placements.find((p) => p.id === contextMenu.placementId);
          const block = placement ? blocksById.get(placement.blockId) ?? null : null;
          items = [
            {
              label: 'Bring to front',
              onClick: () => bringToFront(contextMenu.placementId),
            },
            {
              label: 'Send to back',
              onClick: () => sendToBack(contextMenu.placementId),
            },
            { separator: true },
            {
              label: 'Edit content',
              onClick: () => {
                if (block) {
                  setEditingBlock(block);
                  setModalOpen(true);
                }
              },
            },
            { separator: true },
            {
              label: 'Delete',
              destructive: true,
              onClick: () => {
                setSelectedId(contextMenu.placementId);
                deleteSelected();
              },
            },
          ];
        } else {
          // libraryBlock context menu — clicked a sidebar card
          const block = blocksById.get(contextMenu.blockId) ?? null;
          if (!block) return null;
          items = [
            {
              label: 'Edit',
              onClick: () => {
                setEditingBlock(block);
                setModalOpen(true);
              },
            },
            {
              label: 'Duplicate',
              onClick: async () => {
                const copy = await api.createBlock({
                  type: block.type,
                  content: block.content,
                  tags: block.tags,
                });
                setLibrary((prev) => [...prev, copy]);
              },
            },
            { separator: true },
            {
              label: 'Delete from library',
              destructive: true,
              onClick: () => onDeleteBlock(block),
            },
          ];
        }
        return (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={items}
            onClose={() => setContextMenu(null)}
          />
        );
      })()}
    </div>
  );
}
