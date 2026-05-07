'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createUndoController } from './undo-stack.js';

/** Debounce a callback. The returned function preserves the latest args. */
export function useDebouncedCallback<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delay: number,
): (...args: TArgs) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

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
 *
 * The actual stack mutations live in `createUndoController` so the
 * logic is unit-testable without React. This hook just mirrors the
 * controller's state into a React render.
 */
export function useUndoStack<T>({ initial, capacity = 50 }: UndoStackOptions<T>): UndoStack<T> {
  const controllerRef = useRef<ReturnType<typeof createUndoController<T>> | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createUndoController<T>({ initial, capacity });
  }
  const [state, setState] = useState<T>(initial);
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const set = useCallback<UndoStack<T>['set']>(
    (next, opts) => {
      const value = controllerRef.current!.set(next, opts);
      setState(value);
      if (opts?.history !== false) bump();
    },
    [bump],
  );

  const undo = useCallback(() => {
    const value = controllerRef.current!.undo();
    setState(value);
    bump();
  }, [bump]);

  const redo = useCallback(() => {
    const value = controllerRef.current!.redo();
    setState(value);
    bump();
  }, [bump]);

  return {
    state,
    set,
    undo,
    redo,
    canUndo: controllerRef.current.canUndo(),
    canRedo: controllerRef.current.canRedo(),
  };
}
