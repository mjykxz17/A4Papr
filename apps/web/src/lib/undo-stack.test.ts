import { describe, expect, it } from 'vitest';
import { createUndoController } from './undo-stack.js';

describe('createUndoController', () => {
  it('starts with the initial value and no history', () => {
    const c = createUndoController({ initial: 0 });
    expect(c.state()).toBe(0);
    expect(c.canUndo()).toBe(false);
    expect(c.canRedo()).toBe(false);
  });

  it('set() pushes a snapshot and enables undo', () => {
    const c = createUndoController({ initial: 'a' });
    c.set('b');
    expect(c.state()).toBe('b');
    expect(c.canUndo()).toBe(true);
    expect(c.canRedo()).toBe(false);
  });

  it('undo restores the previous value and enables redo', () => {
    const c = createUndoController({ initial: 'a' });
    c.set('b');
    c.set('c');
    c.undo();
    expect(c.state()).toBe('b');
    expect(c.canUndo()).toBe(true);
    expect(c.canRedo()).toBe(true);
    c.undo();
    expect(c.state()).toBe('a');
    expect(c.canUndo()).toBe(false);
    expect(c.canRedo()).toBe(true);
  });

  it('redo replays the value and disables further redo when exhausted', () => {
    const c = createUndoController({ initial: 0 });
    c.set(1);
    c.set(2);
    c.undo();
    c.undo();
    c.redo();
    expect(c.state()).toBe(1);
    c.redo();
    expect(c.state()).toBe(2);
    expect(c.canRedo()).toBe(false);
  });

  it('a new set() clears the redo future', () => {
    const c = createUndoController({ initial: 0 });
    c.set(1);
    c.set(2);
    c.undo();
    expect(c.canRedo()).toBe(true);
    c.set(99);
    expect(c.canRedo()).toBe(false);
  });

  it('history:false mutates without touching either stack', () => {
    const c = createUndoController({ initial: 0 });
    c.set(1);
    c.set(2, { history: false });
    expect(c.state()).toBe(2);
    c.undo();
    // The history:false write was discarded by undo, returning to 0.
    expect(c.state()).toBe(0);
  });

  it('respects the capacity by dropping the oldest snapshots', () => {
    const c = createUndoController({ initial: 'a', capacity: 2 });
    c.set('b'); // past=[a]
    c.set('c'); // past=[a,b]
    c.set('d'); // past=[b,c] (a dropped)
    c.undo();
    c.undo();
    expect(c.state()).toBe('b');
    expect(c.canUndo()).toBe(false);
  });

  it('functional set receives the current state', () => {
    const c = createUndoController<number[]>({ initial: [1, 2] });
    c.set((prev) => [...prev, 3]);
    expect(c.state()).toEqual([1, 2, 3]);
    c.undo();
    expect(c.state()).toEqual([1, 2]);
  });
});
