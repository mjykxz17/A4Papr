'use client';

import { FONT_SCALE } from '@cheatsheet/shared';

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
  onAutoPack: () => void;
  canAutoPack: boolean;
  fontScale: number;
  onFontScaleChange: (scale: number) => void;
  onExport: () => void;
  onClaim: () => void;
  exporting: boolean;
  saveStatus: 'saved' | 'saving' | 'dirty' | 'error' | 'offline';
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
  onAutoPack,
  canAutoPack,
  fontScale,
  onFontScaleChange,
  onExport,
  onClaim,
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
      <SaveStatusIndicator status={saveStatus} />

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
        <button
          onClick={onAutoPack}
          disabled={!canAutoPack}
          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
          title="Re-pack all blocks into a tight top-left grid (undoable with ⌘Z)"
        >
          Auto-pack
        </button>
        <label
          className="flex items-center gap-1.5 rounded border border-slate-300 px-2 py-1"
          title="Density — scales every block's text on this sheet (and the exported PDF)"
        >
          <span aria-hidden="true" className="text-[10px] text-slate-500">
            A
          </span>
          <input
            type="range"
            min={FONT_SCALE.min}
            max={FONT_SCALE.max}
            step={FONT_SCALE.step}
            value={fontScale}
            onChange={(e) => onFontScaleChange(Number(e.target.value))}
            onDoubleClick={() => onFontScaleChange(FONT_SCALE.default)}
            className="h-1 w-16 accent-slate-600"
            aria-label="Text density"
          />
          <span aria-hidden="true" className="text-sm leading-none text-slate-500">
            A
          </span>
          <span className="w-9 text-right text-xs tabular-nums text-slate-600">
            {Math.round(fontScale * 100)}%
          </span>
        </label>
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
          title='Calibrate "Actual size" to your monitor'
          aria-label="Calibrate actual size"
        >
          ⚙
        </button>
        <button
          onClick={onClaim}
          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
          title="Save your library to an email so you can restore it on another device"
        >
          Save library…
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

interface IndicatorStyle {
  label: string;
  dotClass: string;
  textClass: string;
  /** Semantic level for screen readers. */
  level: 'polite' | 'assertive';
}

function indicatorStyle(s: ToolbarProps['saveStatus']): IndicatorStyle {
  switch (s) {
    case 'saved':
      return {
        label: 'All changes saved',
        dotClass: 'bg-emerald-500',
        textClass: 'text-slate-500',
        level: 'polite',
      };
    case 'saving':
      return {
        label: 'Saving…',
        dotClass: 'bg-sky-500 animate-pulse',
        textClass: 'text-slate-500',
        level: 'polite',
      };
    case 'dirty':
      return {
        label: 'Unsaved changes',
        dotClass: 'bg-amber-500',
        textClass: 'text-slate-600',
        level: 'polite',
      };
    case 'error':
      return {
        label: 'Save failed — retrying',
        dotClass: 'bg-rose-500',
        textClass: 'text-rose-600 font-medium',
        level: 'assertive',
      };
    case 'offline':
      return {
        label: 'Offline — changes will save when reconnected',
        dotClass: 'bg-rose-400',
        textClass: 'text-rose-600 font-medium',
        level: 'assertive',
      };
  }
}

function SaveStatusIndicator({ status }: { status: ToolbarProps['saveStatus'] }) {
  const s = indicatorStyle(status);
  return (
    <span
      role="status"
      aria-live={s.level}
      className={`flex items-center gap-1.5 text-xs ${s.textClass}`}
      title={s.label}
    >
      <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${s.dotClass}`} />
      {s.label}
    </span>
  );
}
