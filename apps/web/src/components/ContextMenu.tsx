'use client';

import { useEffect } from 'react';

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  separator?: false;
}

export interface ContextMenuSeparator {
  separator: true;
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

interface Props {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      {/* Click backdrop closes the menu */}
      <div className="fixed inset-0 z-40" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <ul
        role="menu"
        className="fixed z-50 min-w-[180px] rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
        style={{ left: x, top: y }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {items.map((item, i) =>
          'separator' in item ? (
            <li key={`sep-${i}`} className="my-1 border-t border-slate-200" />
          ) : (
            <li key={item.label}>
              <button
                role="menuitem"
                onClick={() => {
                  item.onClick();
                  onClose();
                }}
                className={`block w-full px-3 py-1.5 text-left hover:bg-slate-100 ${
                  item.destructive ? 'text-red-600 hover:bg-red-50' : 'text-slate-700'
                }`}
              >
                {item.label}
              </button>
            </li>
          ),
        )}
      </ul>
    </>
  );
}
