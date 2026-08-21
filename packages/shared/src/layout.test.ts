import { describe, expect, it } from 'vitest';
import { layoutPlacements, packPlacements } from './schemas.js';
import { A4 } from './units.js';

describe('layoutPlacements', () => {
  it('places a single block at the top-left margin', () => {
    const [box] = layoutPlacements([{ type: 'text' }]);
    expect(box).toEqual({ x: A4.marginMm, y: A4.marginMm, width: 60, height: 30 });
  });

  it('lays blocks left-to-right within a row', () => {
    const boxes = layoutPlacements([{ type: 'text' }, { type: 'text' }, { type: 'formula' }]);
    // 60 + 2 + 60 + 2 + 50 = 174mm, fits in 200mm printable width
    expect(boxes[0]!.x).toBe(5);
    expect(boxes[1]!.x).toBe(5 + 60 + 2);
    expect(boxes[2]!.x).toBe(5 + 60 + 2 + 60 + 2);
    // all on the same row
    expect(boxes.every((b) => b!.y === A4.marginMm)).toBe(true);
  });

  it('wraps to a new row when the next block would overflow', () => {
    // Three 80mm tables: 80 + 2 + 80 = 162 fits, +2 + 80 = 244 doesn't
    const boxes = layoutPlacements([{ type: 'table' }, { type: 'table' }, { type: 'table' }]);
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

describe('packPlacements', () => {
  it('returns [] for no placements', () => {
    expect(packPlacements([])).toEqual([]);
  });

  it('packs in reading order (top-to-bottom, then left-to-right)', () => {
    // Scattered layout: c is highest, then a (left of b on the same row).
    const a = { id: 'a', x: 50, y: 100, width: 60, height: 30 };
    const b = { id: 'b', x: 150, y: 100, width: 60, height: 30 };
    const c = { id: 'c', x: 90, y: 20, width: 60, height: 30 };
    const packed = packPlacements([a, b, c]);
    // Output order mirrors input order (ids stay aligned)…
    expect(packed.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    // …but positions follow reading order: c first, then a, then b.
    const byId = new Map(packed.map((p) => [p.id, p]));
    expect(byId.get('c')).toMatchObject({ x: A4.marginMm, y: A4.marginMm });
    expect(byId.get('a')).toMatchObject({ x: A4.marginMm + 60 + 2, y: A4.marginMm });
    expect(byId.get('b')).toMatchObject({ x: A4.marginMm + (60 + 2) * 2, y: A4.marginMm });
  });

  it('preserves sizes and extra fields', () => {
    const p = { id: 'p', zIndex: 7, x: 100, y: 200, width: 42, height: 17, rotation: 0 };
    const [packed] = packPlacements([p]);
    expect(packed).toMatchObject({ id: 'p', zIndex: 7, width: 42, height: 17, rotation: 0 });
    expect(packed!.x).toBe(A4.marginMm);
    expect(packed!.y).toBe(A4.marginMm);
  });

  it('wraps rows and never places outside the printable width', () => {
    const wide = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      x: i * 40,
      y: 0,
      width: 90,
      height: 20,
    }));
    const packed = packPlacements(wide);
    for (const p of packed) {
      expect(p.x + p.width).toBeLessThanOrEqual(A4.widthMm - A4.marginMm);
      expect(p.x).toBeGreaterThanOrEqual(A4.marginMm);
    }
    // 90+2+90=182 fits in 200; a third 90 wouldn't → two per row.
    expect(packed[2]!.y).toBeGreaterThan(packed[1]!.y);
  });

  it('does not mutate the input array or its placements', () => {
    const original = [{ id: 'a', x: 100, y: 100, width: 60, height: 30 }];
    const snapshot = structuredClone(original);
    packPlacements(original);
    expect(original).toEqual(snapshot);
  });
});
