'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Debounce a callback. The returned function preserves the latest args. */
export function useDebouncedCallback<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delay: number,
): (...args: TArgs) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return useCallback(
    (...args: TArgs) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fnRef.current(...args), delay);
    },
    [delay],
  );
}

/** Detect "is this device probably a phone" — pure CSS media query check. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isMobile;
}

interface UndoStackOptions<T> {
  capacity?: number;
  initial: T;
}

interface UndoStack<T> {
  state: T;
  set: (next: T | ((prev: T) => T), opts?: { history?: boolean }) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Simple snapshot-based undo/redo. Push a new snapshot on every
 * meaningful edit (drop, drag-end, resize-end, delete, duplicate),
 * not on every per-pixel drag tick.
 */
export function useUndoStack<T>({ initial, capacity = 50 }: UndoStackOptions<T>): UndoStack<T> {
  const [state, setState] = useState<T>(initial);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  const set = useCallback(
    (next: T | ((prev: T) => T), opts?: { history?: boolean }) => {
      setState((prev) => {
        const value = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        if (opts?.history !== false) {
          past.current.push(prev);
          if (past.current.length > capacity) past.current.shift();
          future.current = [];
          bump();
        }
        return value;
      });
    },
    [capacity],
  );

  const undo = useCallback(() => {
    setState((prev) => {
      const last = past.current.pop();
      if (last === undefined) return prev;
      future.current.push(prev);
      bump();
      return last;
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      const next = future.current.pop();
      if (next === undefined) return prev;
      past.current.push(prev);
      bump();
      return next;
    });
  }, []);

  // `version` is referenced here so React keeps recomputing canUndo/canRedo
  // when the past/future refs change.
  void version;
  return {
    state,
    set,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
