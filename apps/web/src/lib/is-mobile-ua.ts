/**
 * Server-side mobile detection from the User-Agent header.
 *
 * Used to short-circuit the editor page so a phone never even mounts
 * the Canvas/Moveable stack. The check is a deliberate-coarse string
 * match; client-side we additionally check viewport width (in
 * `useIsMobile`) for a belt-and-braces decision.
 *
 * Returns false for unknown/empty UAs — fail-open for desktop.
 */
const MOBILE_UA = /\b(Mobi(le)?|Android|iPhone|iPod|IEMobile|BlackBerry|Opera Mini|webOS)\b/i;
const TABLET_UA = /\b(iPad|Android(?!.*Mobile)|Tablet|PlayBook)\b/i;

export function isMobileUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  // We intentionally treat tablets the same as desktops — an iPad with
  // a stylus on the canvas works fine. Block phones only.
  if (TABLET_UA.test(ua)) return false;
  return MOBILE_UA.test(ua);
}
