import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { BlockContent } from '@cheatsheet/shared';

/**
 * Schema notes
 * ------------
 * - No `users` table in the MVP. Every row is keyed by a `device_id`
 *   (UUID held in a signed cookie). When real auth lands, a `user_id`
 *   column is added and a claim job copies device_id → user_id.
 * - `content_json` is `jsonb` and is validated via the
 *   `@cheatsheet/shared` zod schemas at every API boundary.
 * - All canvas dimensions live in millimetres, stored as `double precision`.
 */

export const cheatsheets = pgTable(
  'cheatsheets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    deviceId: uuid('device_id').notNull(),
    title: text('title').notNull(),
    paperSize: text('paper_size').notNull().default('A4'),
    orientation: text('orientation').notNull().default('portrait'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byDevice: index('cheatsheets_device_id_idx').on(t.deviceId),
  }),
);

export const blocks = pgTable(
  'blocks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    deviceId: uuid('device_id').notNull(),
    type: text('type').notNull(), // 'text' | 'formula' | 'table'
    contentJson: jsonb('content_json').$type<BlockContent>().notNull(),
    tags: text('tags').array().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byDevice: index('blocks_device_id_idx').on(t.deviceId),
  }),
);

export const blockPlacements = pgTable(
  'block_placements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    cheatsheetId: uuid('cheatsheet_id')
      .notNull()
      .references(() => cheatsheets.id, { onDelete: 'cascade' }),
    blockId: uuid('block_id')
      .notNull()
      .references(() => blocks.id, { onDelete: 'cascade' }),
    x: doublePrecision('x_mm').notNull(),
    y: doublePrecision('y_mm').notNull(),
    width: doublePrecision('width_mm').notNull(),
    height: doublePrecision('height_mm').notNull(),
    rotation: doublePrecision('rotation_deg').notNull().default(0),
    zIndex: integer('z_index').notNull().default(0),
  },
  (t) => ({
    byCheatsheet: index('placements_cheatsheet_id_idx').on(t.cheatsheetId),
    byBlock: index('placements_block_id_idx').on(t.blockId),
  }),
);

export type CheatsheetRow = typeof cheatsheets.$inferSelect;
export type NewCheatsheet = typeof cheatsheets.$inferInsert;
export type BlockRow = typeof blocks.$inferSelect;
export type NewBlock = typeof blocks.$inferInsert;
export type BlockPlacementRow = typeof blockPlacements.$inferSelect;
export type NewBlockPlacement = typeof blockPlacements.$inferInsert;
