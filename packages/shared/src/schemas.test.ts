import { describe, expect, it } from 'vitest';
import {
  BlockContent,
  FormulaBlockContent,
  PlacementPatch,
  TableBlockContent,
  TextBlockContent,
  defaultContentFor,
} from './schemas.js';

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

describe('defaultContentFor', () => {
  it('returns valid content for every block type', () => {
    for (const type of ['text', 'formula', 'table'] as const) {
      const content = defaultContentFor(type);
      // round-trip through the schema
      expect(BlockContent.parse(content).type).toBe(type);
    }
  });
});
