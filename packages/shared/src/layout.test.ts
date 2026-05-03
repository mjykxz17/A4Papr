import { describe, expect, it } from 'vitest';
import { layoutPlacements } from './schemas.js';
import { A4 } from './units.js';

describe('layoutPlacements', () => {
  it('places a single block at the top-left margin', () => {
    const [box] = layoutPlacements([{ type: 'text' }]);
    expect(box).toEqual({ x: A4.marginMm, y: A4.marginMm, width: 60, height: 30 });
  });

  it('lays blocks left-to-right within a row', () => {
    const boxes = layoutPlacements([
      { type: 'text' },
      { type: 'text' },
      { type: 'formula' },
    ]);
    // 60 + 2 + 60 + 2 + 50 = 174mm, fits in 200mm printable width
    expect(boxes[0]!.x).toBe(5);
    expect(boxes[1]!.x).toBe(5 + 60 + 2);
    expect(boxes[2]!.x).toBe(5 + 60 + 2 + 60 + 2);
    // all on the same row
    expect(boxes.every((b) => b!.y === A4.marginMm)).toBe(true);
  });

  it('wraps to a new row when the next block would overflow', () => {
    // Three 80mm tables: 80 + 2 + 80 = 162 fits, +2 + 80 = 244 doesn't
    const boxes = layoutPlacements([
      { type: 'table' },
      { type: 'table' },
      { type: 'table' },
    ]);
    expect(boxes[0]!.y).toBe(A4.marginMm);
    expect(boxes[1]!.y).toBe(A4.marginMm);
    expect(boxes[2]!.y).toBe(A4.marginMm + 40 + 2); // wraps to new row
  });

  it('starts new layout below existing placements', () => {
    const existing = [{ x: 5, y: 5, width: 100, height: 50 }]; // bottom = 55
    const [box] = layoutPlacements([{ type: 'text' }], existing);
    expect(box!.y).toBe(55 + 2); // gap
  });

  it('clamps oversized blocks to the printable width', () => {
    const [box] = layoutPlacements([{ type: 'table', width: 999, height: 30 }]);
    expect(box!.width).toBe(A4.widthMm - 2 * A4.marginMm);
  });
});
