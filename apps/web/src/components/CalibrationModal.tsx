'use client';

import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'cs_screen_calibration';
const REFERENCE_MM = 100;

/** Read the saved calibration factor (1 = browser's CSS mm is accurate). */
export function readCalibration(): number {
  if (typeof window === 'undefined') return 1;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const n = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(n) && n > 0.2 && n < 5 ? n : 1;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (factor: number) => void;
}

export function CalibrationModal({ open, onClose, onSaved }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<string>(String(REFERENCE_MM));

  useEffect(() => {
    if (open) setMeasured(String(REFERENCE_MM));
  }, [open]);

  if (!open) return null;

  const save = () => {
    const m = parseFloat(measured);
    if (!Number.isFinite(m) || m <= 0) return;
    const factor = REFERENCE_MM / m;
    if (factor < 0.2 || factor > 5) return;
    localStorage.setItem(STORAGE_KEY, String(factor));
    onSaved(factor);
    onClose();
  };

  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    onSaved(1);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-medium">Calibrate to your screen</h2>
          <p className="mt-1 text-xs text-slate-500">
            Hold a ruler against the bar below, then enter what it measures. This makes
            &quot;Actual size&quot; truly 1:1 with print.
          </p>
        </header>

        <div className="space-y-4 px-4 py-5">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">0</span>
            <div className="flex-1">
              <div
                ref={barRef}
                style={{ width: `${REFERENCE_MM}mm`, height: 14 }}
                className="rounded bg-accent"
              />
            </div>
            <span className="text-xs text-slate-500">{REFERENCE_MM}mm</span>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">
              Measured length
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                min="20"
                max="200"
                value={measured}
                onChange={(e) => setMeasured(e.target.value)}
                className="w-32 rounded border border-slate-300 px-2 py-1 text-sm focus:border-accent focus:outline-none"
              />
              <span className="text-sm text-slate-600">mm</span>
            </div>
          </label>

          <p className="text-xs text-slate-500">
            Tip: most monitors at 100% browser zoom and 100% OS scaling render this bar at
            close to {REFERENCE_MM}mm already. If yours does, just save without changing the value.
          </p>
        </div>

        <footer className="flex justify-between gap-2 border-t border-slate-200 px-4 py-3">
          <button
            onClick={reset}
            className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            Reset to default
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dark"
            >
              Save
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
