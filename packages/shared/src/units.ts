/**
 * Unit conversions for the canvas and PDF render.
 *
 * The canvas stores positions in millimetres (independent of zoom and DPI).
 * Render-time we convert mm -> CSS pixels at 96 DPI for the screen, or
 * mm -> PostScript points (1/72") for PDF composition.
 */

export const A4 = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 5,
} as const;

export const SCREEN_DPI = 96;
export const PDF_DPI = 72;
export const MM_PER_INCH = 25.4;

/** 1 mm = 96 / 25.4 ≈ 3.7795 CSS pixels at 96 DPI. */
export const MM_TO_PX = SCREEN_DPI / MM_PER_INCH;
/** 1 mm = 72 / 25.4 ≈ 2.8346 PostScript points. */
export const MM_TO_PT = PDF_DPI / MM_PER_INCH;

export function mmToPx(mm: number): number {
  return mm * MM_TO_PX;
}

export function pxToMm(px: number): number {
  return px / MM_TO_PX;
}

export function mmToPt(mm: number): number {
  return mm * MM_TO_PT;
}

/** Snap a millimetre value to the nearest grid step (default 1mm). */
export function snapMm(mm: number, stepMm = 1): number {
  return Math.round(mm / stepMm) * stepMm;
}

/** Clamp a value to [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Clamp a placement so its bounding box stays inside the A4 page.
 * Position is the top-left corner in mm. Returns adjusted x/y.
 */
export function clampToPage(
  x: number,
  y: number,
  widthMm: number,
  heightMm: number,
): { x: number; y: number } {
  return {
    x: clamp(x, 0, A4.widthMm - widthMm),
    y: clamp(y, 0, A4.heightMm - heightMm),
  };
}
