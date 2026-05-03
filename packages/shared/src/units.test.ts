import { describe, expect, it } from 'vitest';
import {
  A4,
  MM_TO_PT,
  MM_TO_PX,
  clamp,
  clampToPage,
  mmToPt,
  mmToPx,
  pxToMm,
  snapMm,
} from './units.js';

describe('units', () => {
  it('A4 is 210x297mm', () => {
    expect(A4.widthMm).toBe(210);
    expect(A4.heightMm).toBe(297);
  });

  it('1mm at 96dpi is 3.7795275... px', () => {
    expect(mmToPx(1)).toBeCloseTo(3.7795275591, 6);
    expect(MM_TO_PX).toBeCloseTo(3.7795275591, 6);
  });

  it('1mm at 72dpi is 2.8346456... pt', () => {
    expect(mmToPt(1)).toBeCloseTo(2.8346456693, 6);
    expect(MM_TO_PT).toBeCloseTo(2.8346456693, 6);
  });

  it('A4 in PostScript points is 595.276 x 841.890', () => {
    expect(mmToPt(A4.widthMm)).toBeCloseTo(595.276, 2);
    expect(mmToPt(A4.heightMm)).toBeCloseTo(841.89, 2);
  });

  it('mmToPx and pxToMm round-trip', () => {
    for (const mm of [0, 1, 5, 10.5, 100, 210]) {
      expect(pxToMm(mmToPx(mm))).toBeCloseTo(mm, 9);
    }
  });

  describe('snapMm', () => {
    it('snaps to 1mm by default', () => {
      expect(snapMm(0)).toBe(0);
      expect(snapMm(0.4)).toBe(0);
      expect(snapMm(0.5)).toBe(1); // half rounds up by Math.round
      expect(snapMm(1.49)).toBe(1);
      expect(snapMm(2.7)).toBe(3);
    });

    it('respects custom step', () => {
      expect(snapMm(7, 5)).toBe(5);
      expect(snapMm(8, 5)).toBe(10);
    });

    it('handles negatives', () => {
      expect(snapMm(-0.4)).toBe(-0);
      expect(snapMm(-1.6)).toBe(-2);
    });
  });

  describe('clamp', () => {
    it('clamps to bounds', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-1, 0, 10)).toBe(0);
      expect(clamp(11, 0, 10)).toBe(10);
    });
  });

  describe('clampToPage', () => {
    it('keeps placement inside A4', () => {
      expect(clampToPage(100, 100, 50, 50)).toEqual({ x: 100, y: 100 });
    });

    it('pulls back when overflowing right/bottom', () => {
      // A 50x50 block at (200,290) on a 210x297 page: max x = 160, max y = 247
      expect(clampToPage(200, 290, 50, 50)).toEqual({ x: 160, y: 247 });
    });

    it('pulls back when negative', () => {
      expect(clampToPage(-5, -5, 50, 50)).toEqual({ x: 0, y: 0 });
    });
  });
});
