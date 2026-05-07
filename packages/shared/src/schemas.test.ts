import { describe, expect, it } from 'vitest';
import {
  BlockContent,
  FormulaBlockContent,
  PlacementPatch,
  TableBlockContent,
  TextBlockContent,
  UpsertPlacementInput,
  defaultContentFor,
  normalisePlacement,
} from './schemas.js';
import { A4 } from './units.js';

describe('block content schemas', () => {
  describe('text', () => {
    it('accepts a valid text block', () => {
      const ok = TextBlockContent.parse({
        type: 'text',
        markdown: '**hello** world',
        fontSize: 'sm',
        align: 'left',
      });
      expect(ok.markdown).toBe('**hello** world');
    });

    it('rejects markdown over 2000 chars', () => {
      const long = 'a'.repeat(2001);
      expect(() =>
        TextBlockContent.parse({ type: 'text', markdown: long, fontSize: 'sm', align: 'left' }),
      ).toThrow();
    });

    it('rejects unknown fontSize', () => {
      expect(() =>
        TextBlockContent.parse({ type: 'text', markdown: '', fontSize: 'huge', align: 'left' }),
      ).toThrow();
    });
  });

  describe('formula', () => {
    it('accepts a valid formula', () => {
      const f = FormulaBlockContent.parse({
        type: 'formula',
        latex: 'P(A|B) = \\frac{P(B|A)P(A)}{P(B)}',
        displayMode: true,
      });
      expect(f.displayMode).toBe(true);
    });

    it('rejects latex over 500 chars', () => {
      expect(() =>
        FormulaBlockContent.parse({
          type: 'formula',
          latex: 'a'.repeat(501),
          displayMode: false,
        }),
      ).toThrow();
    });

    it('accepts CJK content', () => {
      // bilingual support is non-negotiable
      const f = FormulaBlockContent.parse({
        type: 'formula',
        latex: '\\text{贝叶斯定理}',
        displayMode: true,
      });
      expect(f.latex).toContain('贝叶斯');
    });
  });

  describe('table', () => {
    it('accepts a valid table', () => {
      const t = TableBlockContent.parse({
        type: 'table',
        headers: ['a', 'b'],
        rows: [
          ['1', '2'],
          ['3', '4'],
        ],
        compact: false,
        headerStyle: 'bold',
      });
      expect(t.rows).toHaveLength(2);
    });

    it('rejects > 12 columns', () => {
      expect(() =>
        TableBlockContent.parse({
          type: 'table',
          headers: Array(13).fill('h'),
          rows: [],
          compact: false,
          headerStyle: 'none',
        }),
      ).toThrow();
    });

    it('rejects > 30 rows', () => {
      expect(() =>
        TableBlockContent.parse({
          type: 'table',
          headers: ['h'],
          rows: Array(31).fill(['r']),
          compact: false,
          headerStyle: 'none',
        }),
      ).toThrow();
    });
  });

  describe('discriminated union', () => {
    it('routes to the right variant by type', () => {
      const text = BlockContent.parse({
        type: 'text',
        markdown: '',
        fontSize: 'base',
        align: 'right',
      });
      expect(text.type).toBe('text');
    });

    it('rejects unknown type', () => {
      expect(() => BlockContent.parse({ type: 'image', url: 'x' })).toThrow();
    });
  });
});

describe('PlacementPatch', () => {
  it('accepts an empty patch', () => {
    const p = PlacementPatch.parse({ upserts: [], deletes: [] });
    expect(p.upserts).toEqual([]);
    expect(p.deletes).toEqual([]);
  });

  it('rejects non-positive width/height', () => {
    expect(() =>
      PlacementPatch.parse({
        upserts: [
          {
            blockId: '11111111-1111-1111-1111-111111111111',
            x: 0,
            y: 0,
            width: 0,
            height: 10,
          },
        ],
        deletes: [],
      }),
    ).toThrow();
  });
});

describe('UpsertPlacementInput page-bounds', () => {
  const baseValid = {
    id: '11111111-1111-1111-1111-111111111111',
    blockId: '22222222-2222-2222-2222-222222222222',
    x: 10,
    y: 10,
    width: 50,
    height: 30,
    rotation: 0,
    zIndex: 0,
  };

  it('accepts a placement that fits inside A4', () => {
    expect(UpsertPlacementInput.parse(baseValid).x).toBe(10);
  });

  it('rejects a placement whose right edge runs off the page', () => {
    expect(() =>
      UpsertPlacementInput.parse({ ...baseValid, x: A4.widthMm - 10, width: 50 }),
    ).toThrow(/right edge/);
  });

  it('rejects a placement whose bottom edge runs off the page', () => {
    expect(() =>
      UpsertPlacementInput.parse({ ...baseValid, y: A4.heightMm - 10, height: 50 }),
    ).toThrow(/bottom/);
  });

  it('rejects a placement positioned far above the page', () => {
    expect(() => UpsertPlacementInput.parse({ ...baseValid, y: -10 })).toThrow(/above/);
  });

  it('tolerates a small overflow slack (≤2mm)', () => {
    // simulate float-rounding mid-resize
    const input = {
      ...baseValid,
      x: A4.widthMm - 50 + 1.5, // 1.5mm over-edge
    };
    expect(UpsertPlacementInput.parse(input).x).toBeCloseTo(A4.widthMm - 50 + 1.5, 6);
  });
});

describe('normalisePlacement', () => {
  it('returns the input unchanged when it fits', () => {
    const p = { x: 20, y: 20, width: 100, height: 50 };
    expect(normalisePlacement(p)).toEqual(p);
  });

  it('clamps x/y back inside the page', () => {
    const out = normalisePlacement({ x: -5, y: -5, width: 50, height: 50 });
    expect(out).toEqual({ x: 0, y: 0, width: 50, height: 50 });
  });

  it('caps width/height at A4', () => {
    const out = normalisePlacement({ x: 0, y: 0, width: 999, height: 999 });
    expect(out.width).toBe(A4.widthMm);
    expect(out.height).toBe(A4.heightMm);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });

  it('preserves additional fields', () => {
    const out = normalisePlacement({
      x: -5,
      y: -5,
      width: 50,
      height: 50,
      blockId: 'b',
      rotation: 12,
    });
    expect(out.blockId).toBe('b');
    expect(out.rotation).toBe(12);
  });
});

describe('defaultContentFor', () => {
  it('returns valid content for every block type', () => {
    for (const type of ['text', 'formula', 'table'] as const) {
      const content = defaultContentFor(type);
      // round-trip through the schema
      expect(BlockContent.parse(content).type).toBe(type);
    }
  });
});
