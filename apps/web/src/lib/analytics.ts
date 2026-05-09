/**
 * Anonymous product analytics.
 *
 * Server-side: `recordEvent(deviceId, name, props)` writes one row to
 * the `events` table. Best-effort — never throws into the request path.
 *
 * Client-side: `track(name, props)` POSTs to /api/events. The endpoint
 * is rate-limited (per device) so a misbehaving client can't spam the
 * table.
 *
 * Naming convention: lower_snake_case verbs at past tense
 * (`block_created`, `pdf_exported`, `template_forked`). Keep the set
 * small; add only when you'd actually look at the number.
 */
import { events as eventsTable, getDb } from '@cheatsheet/db';
import { log } from './logger.js';

/**
 * The closed set of event names. Add a string here BEFORE writing it
 * anywhere — that way TypeScript catches typos at the call site.
 */
export type EventName =
  | 'landed'
  | 'editor_opened'
  | 'block_created'
  | 'block_edited'
  | 'block_deleted'
  | 'placement_created'
  | 'pdf_exported'
  | 'extract_used'
  | 'template_forked'
  | 'share_minted'
  | 'share_revoked'
  | 'share_forked'
  | 'tidy_applied'
  | 'preview_toggled'
  | 'claim_started';

const ALLOWED_EVENTS: ReadonlySet<EventName> = new Set<EventName>([
  'landed',
  'editor_opened',
  'block_created',
  'block_edited',
  'block_deleted',
  'placement_created',
  'pdf_exported',
  'extract_used',
  'template_forked',
  'share_minted',
  'share_revoked',
  'share_forked',
  'tidy_applied',
  'preview_toggled',
  'claim_started',
]);

export function isKnownEventName(s: string): s is EventName {
  return ALLOWED_EVENTS.has(s as EventName);
}

export async function recordEvent(
  deviceId: string,
  name: EventName,
  props: Record<string, unknown> = {},
): Promise<void> {
  try {
    await getDb().insert(eventsTable).values({ deviceId, name, props });
  } catch (err) {
    // Analytics is fire-and-forget — failure here must never break the
    // user-visible request. Log it so we know the table is broken.
    log.error('analytics insert failed', { name, err: String(err) });
  }
}
