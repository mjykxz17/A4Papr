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

// NOTE: when editing schemas, regenerate the SQL with:
//   pnpm db:generate
// then commit the new file under packages/db/drizzle/. CI applies
// pending migrations before running tests.

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
    /**
     * Optional public share slug. When set, anyone with the slug can read
     * (and fork) the cheatsheet via /share/{slug}. Setting this is opt-in
     * — there's a "Share" button in the toolbar; default is null.
     */
    publicSlug: text('public_slug').unique(),
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

/**
 * Anthropic call accounting. One row per /api/extract invocation, used to
 * answer "how many tokens did device X spend last week" and to enforce a
 * daily input budget.
 */
export const aiUsage = pgTable(
  'ai_usage',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    deviceId: uuid('device_id').notNull(),
    route: text('route').notNull(), // e.g. 'extract'
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    /** HTTP status of the call (200, 429, 502, …). */
    status: integer('status').notNull(),
    /** End-to-end duration in ms. */
    durationMs: integer('duration_ms').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byDevice: index('ai_usage_device_id_idx').on(t.deviceId),
    byCreated: index('ai_usage_created_at_idx').on(t.createdAt),
  }),
);

/**
 * Magic-link claim: the canonical mapping from email → device_id. Claiming
 * an email re-binds it to the current device. Verifying a token on a fresh
 * device adopts the device_id stored here so both devices share a library.
 */
export const authClaims = pgTable('auth_claims', {
  email: text('email').primaryKey(),
  deviceId: uuid('device_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * One-time-use token table for magic-link verification. Tokens expire
 * after 30 minutes and are marked consumed on first use.
 */
export const authTokens = pgTable(
  'auth_tokens',
  {
    token: text('token').primaryKey(),
    email: text('email').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byEmail: index('auth_tokens_email_idx').on(t.email),
  }),
);

/**
 * Image upload metadata. Files are content-addressed by SHA-256 hash and
 * stored on disk under `apps/web/public/uploads/{hash}.{ext}`. This table
 * tracks ownership for cleanup and per-device quota.
 */
export const imageUploads = pgTable(
  'image_uploads',
  {
    hash: text('hash').primaryKey(),
    deviceId: uuid('device_id').notNull(),
    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byDevice: index('image_uploads_device_id_idx').on(t.deviceId),
  }),
);

/**
 * Anonymous product analytics. One row per significant user action;
 * keyed by device_id, NOT user-identifying. Used to answer "what's the
 * funnel from landing → first export?" without sending data to a third
 * party.
 *
 * Names are short and stable: `landed`, `template_forked`, `extract_used`,
 * `block_created`, `pdf_exported`, `share_minted`, `share_forked`,
 * `share_revoked`, `tidy_applied`, `preview_toggled`. Add new names
 * sparingly — code searching is the analytics dashboard.
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    deviceId: uuid('device_id').notNull(),
    name: text('name').notNull(),
    /** Free-form props, kept small (≤ 1 KB after JSON encoding). */
    props: jsonb('props').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byDevice: index('events_device_id_idx').on(t.deviceId),
    byCreatedAt: index('events_created_at_idx').on(t.createdAt),
    byName: index('events_name_idx').on(t.name),
  }),
);

export type CheatsheetRow = typeof cheatsheets.$inferSelect;
export type NewCheatsheet = typeof cheatsheets.$inferInsert;
export type BlockRow = typeof blocks.$inferSelect;
export type NewBlock = typeof blocks.$inferInsert;
export type BlockPlacementRow = typeof blockPlacements.$inferSelect;
export type NewBlockPlacement = typeof blockPlacements.$inferInsert;
export type AiUsageRow = typeof aiUsage.$inferSelect;
export type NewAiUsage = typeof aiUsage.$inferInsert;
export type AuthClaimRow = typeof authClaims.$inferSelect;
export type AuthTokenRow = typeof authTokens.$inferSelect;
export type ImageUploadRow = typeof imageUploads.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
