/**
 * Pure snapshot-based undo/redo controller. The React hook
 * `useUndoStack` (in `./hooks.ts`) is a thin wrapper that mirrors
 * controller state into a React component; the controller itself
 * has zero React dependencies so it can be unit-tested directly.
 *
 * Semantics:
 * - `set(value)` pushes the previous snapshot onto `past`, clears
 *   `future`. `set(value, { history: false })` mutates without
 *   touching either stack — used for transient drag previews that
 *   shouldn't add to history.
 * - `undo()` pops `past` → state, pushes prior state onto `future`.
 * - `redo()` pops `future` → state, pushes prior state onto `past`.
 * - `capacity` bounds `past`; once exceeded, oldest is dropped.
 */
export interface UndoController<T> {
  state(): T;
  set(next: T | ((prev: T) => T), opts?: { history?: boolean }): T;
  undo(): T;
  redo(): T;
  canUndo(): boolean;
  canRedo(): boolean;
}

export interface UndoOptions<T> {
  initial: T;
  capacity?: number;
}

export function createUndoController<T>({
  initial,
  capacity = 50,
}: UndoOptions<T>): UndoController<T> {
  let current = initial;
  const past: T[] = [];
  const future: T[] = [];

  const set: UndoController<T>['set'] = (next, opts) => {
    const value = typeof next === 'function' ? (next as (p: T) => T)(current) : next;
    if (opts?.history !== false) {
      past.push(current);
      if (past.length > capacity) past.shift();
      future.length = 0;
    }
    current = value;
    return current;
  };

  const undo: UndoController<T>['undo'] = () => {
    const prev = past.pop();
    if (prev === undefined) return current;
    future.push(current);
    current = prev;
    return current;
  };

  const redo: UndoController<T>['redo'] = () => {
    const next = future.pop();
    if (next === undefined) return current;
    past.push(current);
    current = next;
    return current;
  };

  return {
    state: () => current,
    set,
    undo,
    redo,
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  };
}
