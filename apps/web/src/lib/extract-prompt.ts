/**
 * Helpers for the AI extraction route, separated so they can be unit-
 * tested without booting Next route handlers.
 */

export const MAX_NOTES_LENGTH = 50_000;

/**
 * Defuse prompt-injection attempts in user-supplied notes.
 *
 * The notes are passed to the model wrapped in a `<student_notes>` tag.
 * If a user pastes content that closes that tag, the model would treat
 * subsequent instructions as authoritative. Replace any literal copy of
 * the wrapper tags with a visible placeholder so the boundary stays
 * intact. The system prompt also tells the model to treat the wrapped
 * content as untrusted data — defence in depth.
 */
export function sanitiseNotes(text: string): string {
  return text
    .replace(/<\/student_notes>/gi, '[/student_notes]')
    .replace(/<student_notes>/gi, '[student_notes]');
}

export function wrapNotes(text: string): string {
  return `<student_notes>\n${sanitiseNotes(text)}\n</student_notes>`;
}
