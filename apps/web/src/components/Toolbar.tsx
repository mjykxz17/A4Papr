'use client';

interface ToolbarProps {
  title: string;
  onTitleChange: (title: string) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onActualSize: () => void;
  onCalibrate: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onExport: () => void;
  exporting: boolean;
  saveStatus: 'saved' | 'saving' | 'dirty' | 'error';
}

export function Toolbar({
  title,
  onTitleChange,
  zoom,
  onZoomChange,
  onActualSize,
  onCalibrate,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onExport,
  exporting,
  saveStatus,
}: ToolbarProps) {
  return (
    <header className="editor-chrome flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
      <h1 className="text-base font-semibold text-slate-900">A4 Papr</h1>
      <input
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        className="ml-2 max-w-xs rounded border border-transparent px-2 py-1 text-sm focus:border-slate-300 focus:outline-none"
      />
      <span className="text-xs text-slate-500">{statusLabel(saveStatus)}</span>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40"
          title="Undo (⌘Z)"
        >
          ↶
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40"
          title="Redo (⇧⌘Z)"
        >
          ↷
        </button>
        <div className="flex items-center rounded border border-slate-300">
          <button
            onClick={() => onZoomChange(Math.max(0.25, zoom - 0.1))}
            className="px-2 py-1 text-xs hover:bg-slate-50"
            title="Zoom out (⌘−)"
          >
            −
          </button>
          <span className="px-2 text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => onZoomChange(Math.min(4, zoom + 0.1))}
            className="px-2 py-1 text-xs hover:bg-slate-50"
            title="Zoom in (⌘+)"
          >
            +
          </button>
          <button
            onClick={() => onZoomChange(1)}
            className="border-l border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
            title="Reset to 100% (⌘0)"
          >
            100%
          </button>
        </div>
        <button
          onClick={onActualSize}
          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
          title="Render at physical A4 size — preview how it will print"
        >
          Actual size
        </button>
        <button
          onClick={onCalibrate}
          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
          title="Calibrate &quot;Actual size&quot; to your monitor"
          aria-label="Calibrate actual size"
        >
          ⚙
        </button>
        <button
          onClick={onExport}
          disabled={exporting}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
        >
          {exporting ? 'Exporting…' : 'Export PDF'}
        </button>
      </div>
    </header>
  );
}

function statusLabel(s: ToolbarProps['saveStatus']): string {
  switch (s) {
    case 'saved':
      return 'All changes saved';
    case 'saving':
      return 'Saving…';
    case 'dirty':
      return 'Unsaved changes';
    case 'error':
      return 'Save failed — retrying';
  }
}
