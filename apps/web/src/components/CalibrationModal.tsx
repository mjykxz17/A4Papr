'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'cs_screen_calibration';
const REFERENCE_MM = 100;
// ISO/IEC 7810 ID-1 — every credit / debit / ID card on the planet.
const CARD_W_MM = 85.6;
const CARD_H_MM = 53.98;

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

type Mode = 'card' | 'ruler';

export function CalibrationModal({ open, onClose, onSaved }: Props) {
  const [mode, setMode] = useState<Mode>('card');
  // Card-mode state: live factor controlled by a slider (1.0 = no change).
  const [cardFactor, setCardFactor] = useState(1);
  // Ruler-mode state: user types the measured mm.
  const [measured, setMeasured] = useState<string>(String(REFERENCE_MM));

  useEffect(() => {
    if (open) {
      setMode('card');
      setCardFactor(readCalibration());
      setMeasured(String(REFERENCE_MM));
    }
  }, [open]);

  if (!open) return null;

  const persist = (factor: number) => {
    if (factor < 0.2 || factor > 5) return;
    localStorage.setItem(STORAGE_KEY, String(factor));
    onSaved(factor);
    onClose();
  };

  const saveRuler = () => {
    const m = parseFloat(measured);
    if (!Number.isFinite(m) || m <= 0) return;
    persist(REFERENCE_MM / m);
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
            Make &quot;Actual size&quot; truly 1:1 with print on this monitor.
          </p>
        </header>

        <div className="flex border-b border-slate-200 text-xs">
          <button
            type="button"
            onClick={() => setMode('card')}
            className={`flex-1 px-3 py-2 ${
              mode === 'card'
                ? 'border-b-2 border-accent font-medium text-accent-dark'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            💳 Use a credit card (recommended)
          </button>
          <button
            type="button"
            onClick={() => setMode('ruler')}
            className={`flex-1 px-3 py-2 ${
              mode === 'ruler'
                ? 'border-b-2 border-accent font-medium text-accent-dark'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            📏 Use a ruler
          </button>
        </div>

        {mode === 'card' && (
          <div className="space-y-4 px-4 py-5">
            <p className="text-xs text-slate-600">
              Hold any credit card, debit card, or ID card flat against the screen and
              drag the slider until the outline matches the card&apos;s edges. Every payment
              card globally is 85.60 × 53.98&nbsp;mm (ISO/IEC 7810 ID-1).
            </p>
            <div className="flex justify-center rounded border border-slate-200 bg-slate-50 py-6">
              <div
                className="rounded border-2 border-dashed border-accent bg-white"
                style={{
                  width: `${CARD_W_MM * cardFactor}mm`,
                  height: `${CARD_H_MM * cardFactor}mm`,
                }}
                aria-label="Calibration card outline"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">
                Adjust until your card fits exactly inside the outline
              </label>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.005"
                value={cardFactor}
                onChange={(e) => setCardFactor(parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] tabular-nums text-slate-500">
                <span>0.5×</span>
                <span>{Math.round(cardFactor * 100)}%</span>
                <span>2×</span>
              </div>
            </div>
          </div>
        )}

        {mode === 'ruler' && (
          <div className="space-y-4 px-4 py-5">
            <p className="text-xs text-slate-600">
              Hold a ruler against the bar below, then enter what it measures.
            </p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">0</span>
              <div className="flex-1">
                <div
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
              Tip: most monitors at 100% browser zoom + 100% OS scaling render this bar
              at close to {REFERENCE_MM}mm already. If yours does, save without changing
              the value.
            </p>
          </div>
        )}

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
              onClick={mode === 'card' ? () => persist(cardFactor) : saveRuler}
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
