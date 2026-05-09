import { describe, expect, it } from 'vitest';
import { A4, BlockContent, BlockType } from '@cheatsheet/shared';
import { TEMPLATES, templateById } from './templates.js';

describe('templates', () => {
  it('every template has at least one block and unique id', () => {
    expect(TEMPLATES.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const tpl of TEMPLATES) {
      expect(tpl.blocks.length).toBeGreaterThan(0);
      expect(ids.has(tpl.id)).toBe(false);
      ids.add(tpl.id);
    }
  });

  it('every block in every template parses against BlockContent', () => {
    for (const tpl of TEMPLATES) {
      for (const b of tpl.blocks) {
        expect(BlockType.parse(b.type)).toBe(b.type);
        expect(BlockContent.parse(b.content)).toEqual(b.content);
      }
    }
  });

  it('every placement points at a real block index and fits inside A4', () => {
    for (const tpl of TEMPLATES) {
      for (const p of tpl.placements) {
        expect(p.blockIndex).toBeGreaterThanOrEqual(0);
        expect(p.blockIndex).toBeLessThan(tpl.blocks.length);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.x + p.width).toBeLessThanOrEqual(A4.widthMm + 0.01);
        expect(p.y + p.height).toBeLessThanOrEqual(A4.heightMm + 0.01);
        expect(p.width).toBeGreaterThan(0);
        expect(p.height).toBeGreaterThan(0);
      }
    }
  });

  it('templateById returns the matching template', () => {
    const first = TEMPLATES[0]!;
    expect(templateById(first.id)).toBe(first);
    expect(templateById('does-not-exist')).toBeUndefined();
  });
});
