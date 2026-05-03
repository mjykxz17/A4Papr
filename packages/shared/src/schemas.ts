import { z } from 'zod';
import { A4 } from './units.js';

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

export const BlockPlacement = z.object({
  id: uuid,
  cheatsheetId: uuid,
  blockId: uuid,
  x: mm,
  y: mm,
  width: positiveMm,
  height: positiveMm,
  rotation: z.number().min(-360).max(360),
  zIndex: z.number().int().min(0).max(10_000),
});
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

export const UpsertPlacementInput = z.object({
  id: uuid,
  blockId: uuid,
  x: mm,
  y: mm,
  width: positiveMm,
  height: positiveMm,
  rotation: z.number().min(-360).max(360).default(0),
  zIndex: z.number().int().min(0).max(10_000).default(0),
});
export type UpsertPlacementInput = z.infer<typeof UpsertPlacementInput>;

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

export const PAGE = A4;
