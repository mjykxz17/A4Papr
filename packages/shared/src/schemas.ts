import { z } from 'zod';
import { A4, clamp, clampToPage } from './units.js';

/* ------------------------------------------------------------------ *
 * Block content schemas — one per `type`.
 * Stored verbatim in the `blocks.content_json` jsonb column.
 * ------------------------------------------------------------------ */

export const TextBlockContent = z.object({
  type: z.literal('text'),
  markdown: z.string().max(2000),
  fontSize: z.enum(['xs', 'sm', 'base']),
  align: z.enum(['left', 'center', 'right']),
});
export type TextBlockContent = z.infer<typeof TextBlockContent>;

export const FormulaBlockContent = z.object({
  type: z.literal('formula'),
  latex: z.string().max(500),
  displayMode: z.boolean(),
});
export type FormulaBlockContent = z.infer<typeof FormulaBlockContent>;

export const TableBlockContent = z.object({
  type: z.literal('table'),
  headers: z.array(z.string()).max(12),
  rows: z.array(z.array(z.string()).max(12)).max(30),
  compact: z.boolean(),
  headerStyle: z.enum(['bold', 'shaded', 'none']),
});
export type TableBlockContent = z.infer<typeof TableBlockContent>;

export const BlockContent = z.discriminatedUnion('type', [
  TextBlockContent,
  FormulaBlockContent,
  TableBlockContent,
]);
export type BlockContent = z.infer<typeof BlockContent>;

export const BlockType = z.enum(['text', 'formula', 'table']);
export type BlockType = z.infer<typeof BlockType>;

/* ------------------------------------------------------------------ *
 * Persistence DTOs — what crosses the wire between web and API.
 * ------------------------------------------------------------------ */

const uuid = z.string().uuid();
const mm = z.number().finite().min(-1000).max(1000);
const positiveMm = z.number().finite().positive().max(1000);

/**
 * Tolerance used when validating that a placement fits the A4 page.
 * The canvas snaps to 1mm and clamps with `clampToPage`, but floating
 * point and `auto`-grown content can land 1–2mm over the edge during
 * a debounce window. Allow a small slack to avoid spurious 400s.
 */
const PAGE_OVERFLOW_TOLERANCE_MM = 2;

/** Refinement: a placement's bounding box must fit (mostly) inside A4. */
function fitsOnPage<T extends { x: number; y: number; width: number; height: number }>(
  v: T,
  ctx: z.RefinementCtx,
): void {
  const slack = PAGE_OVERFLOW_TOLERANCE_MM;
  if (v.x < -slack) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['x'], message: 'x is left of the page' });
  }
  if (v.y < -slack) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['y'], message: 'y is above the page' });
  }
  if (v.width > A4.widthMm + slack) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['width'],
      message: `width exceeds A4 (${A4.widthMm}mm)`,
    });
  }
  if (v.height > A4.heightMm + slack) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['height'],
      message: `height exceeds A4 (${A4.heightMm}mm)`,
    });
  }
  if (v.x + v.width > A4.widthMm + slack) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['x'],
      message: 'placement runs off the right edge of the page',
    });
  }
  if (v.y + v.height > A4.heightMm + slack) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['y'],
      message: 'placement runs off the bottom of the page',
    });
  }
}

export const Block = z.object({
  id: uuid,
  deviceId: uuid,
  type: BlockType,
  content: BlockContent,
  tags: z.array(z.string().max(40)).max(20),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Block = z.infer<typeof Block>;

export const BlockPlacement = z
  .object({
    id: uuid,
    cheatsheetId: uuid,
    blockId: uuid,
    x: mm,
    y: mm,
    width: positiveMm,
    height: positiveMm,
    rotation: z.number().min(-360).max(360),
    zIndex: z.number().int().min(0).max(10_000),
  })
  .superRefine(fitsOnPage);
export type BlockPlacement = z.infer<typeof BlockPlacement>;

export const Cheatsheet = z.object({
  id: uuid,
  deviceId: uuid,
  title: z.string().min(1).max(200),
  paperSize: z.literal('A4'),
  orientation: z.literal('portrait'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Cheatsheet = z.infer<typeof Cheatsheet>;

export const CheatsheetWithPlacements = Cheatsheet.extend({
  placements: z.array(BlockPlacement),
});
export type CheatsheetWithPlacements = z.infer<typeof CheatsheetWithPlacements>;

/* ------------------------------------------------------------------ *
 * API request schemas.
 * ------------------------------------------------------------------ */

export const CreateBlockInput = z.object({
  type: BlockType,
  content: BlockContent,
  tags: z.array(z.string().max(40)).max(20).default([]),
});
export type CreateBlockInput = z.infer<typeof CreateBlockInput>;

export const UpdateBlockInput = z.object({
  content: BlockContent,
  tags: z.array(z.string().max(40)).max(20).optional(),
});
export type UpdateBlockInput = z.infer<typeof UpdateBlockInput>;

export const CreateCheatsheetInput = z.object({
  title: z.string().min(1).max(200).default('Untitled cheatsheet'),
});
export type CreateCheatsheetInput = z.infer<typeof CreateCheatsheetInput>;

export const UpsertPlacementInput = z
  .object({
    id: uuid,
    blockId: uuid,
    x: mm,
    y: mm,
    width: positiveMm,
    height: positiveMm,
    rotation: z.number().min(-360).max(360).default(0),
    zIndex: z.number().int().min(0).max(10_000).default(0),
  })
  .superRefine(fitsOnPage);
export type UpsertPlacementInput = z.infer<typeof UpsertPlacementInput>;

/**
 * Server-side normaliser: clamp a placement so its bounding box fits
 * exactly inside A4. Use this *after* schema validation when persisting
 * to the DB — it removes the slack tolerance and guarantees the stored
 * placement renders within the printable area.
 */
export function normalisePlacement<
  T extends { x: number; y: number; width: number; height: number },
>(p: T): T {
  const width = clamp(p.width, 1, A4.widthMm);
  const height = clamp(p.height, 1, A4.heightMm);
  const { x, y } = clampToPage(p.x, p.y, width, height);
  return { ...p, x, y, width, height };
}

/** Bulk patch sent by the canvas auto-saver. */
export const PlacementPatch = z.object({
  upserts: z.array(UpsertPlacementInput).max(500),
  deletes: z.array(uuid).max(500),
});
export type PlacementPatch = z.infer<typeof PlacementPatch>;

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

export function defaultContentFor(type: BlockType): BlockContent {
  switch (type) {
    case 'text':
      return { type: 'text', markdown: '', fontSize: 'sm', align: 'left' };
    case 'formula':
      return { type: 'formula', latex: '', displayMode: false };
    case 'table':
      return {
        type: 'table',
        headers: ['Col 1', 'Col 2'],
        rows: [['', '']],
        compact: false,
        headerStyle: 'bold',
      };
  }
}

/** Default placement size when a block is first dropped on the canvas. */
export function defaultPlacementSize(type: BlockType): { width: number; height: number } {
  switch (type) {
    case 'text':
      return { width: 60, height: 30 };
    case 'formula':
      return { width: 50, height: 15 };
    case 'table':
      return { width: 80, height: 40 };
  }
}

interface LayoutInput {
  type: BlockType;
  width?: number;
  height?: number;
}

interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Pack a list of blocks into the A4 printable area using a left-to-right,
 * top-to-bottom shelf algorithm. Optionally avoids overlapping a set of
 * existing rectangles (e.g. placements already on the canvas) — new
 * blocks are placed below the lowest existing one.
 *
 * Returns the same number of boxes as inputs; if a block doesn't fit on
 * the page, it's still positioned (clamped to the page) so the caller
 * can decide what to do.
 */
export function layoutPlacements(
  blocks: LayoutInput[],
  existing: Array<{ x: number; y: number; width: number; height: number }> = [],
  options: { gapMm?: number } = {},
): LayoutBox[] {
  const gap = options.gapMm ?? 2;
  const left: number = A4.marginMm;
  const right: number = A4.widthMm - A4.marginMm;
  const bottom: number = A4.heightMm - A4.marginMm;
  const startY = existing.reduce<number>(
    (max, p) => Math.max(max, p.y + p.height + gap),
    A4.marginMm,
  );

  const out: LayoutBox[] = [];
  let cursorX = left;
  let cursorY = startY;
  let rowHeight = 0;

  for (const b of blocks) {
    const size = defaultPlacementSize(b.type);
    const w = clamp(b.width ?? size.width, 5, right - left);
    const h = clamp(b.height ?? size.height, 5, bottom - A4.marginMm);

    if (cursorX + w > right && cursorX > left) {
      cursorX = left;
      cursorY += rowHeight + gap;
      rowHeight = 0;
    }
    const x = clamp(cursorX, left, right - w);
    const y = clamp(cursorY, A4.marginMm, bottom - h);
    out.push({ x, y, width: w, height: h });
    cursorX = x + w + gap;
    rowHeight = Math.max(rowHeight, h);
  }
  return out;
}

export const PAGE = A4;
