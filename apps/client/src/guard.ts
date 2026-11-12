// Pure tap-guard math (no DOM, unit tested).
//
// Times are event timestamps on the page clock (`event.timeStamp`, same
// origin as `performance.now()`). Comparing the taps' own stamps, not the time
// the handler happens to run, keeps the guard right on a busy phone whose
// main thread delivers a second tap late.

/**
 * True when a tap stamped `tapAt` may act: it came at least `guardMs` after
 * the tap stamped `armedAt` (null = no guard armed). A non-finite stamp never
 * locks the button.
 */
export function guardOpen(armedAt: number | null, tapAt: number, guardMs: number): boolean {
  if (armedAt === null || !Number.isFinite(armedAt) || !Number.isFinite(tapAt)) return true;
  return tapAt - armedAt >= guardMs;
}
