// How long a drawn frame takes on this device (S-05-3). Decorative motion that
// would only add more slow frames (the carousel slide) is skipped when drawing
// a frame is slow, so it never holds up the next touch. A frame counts once it
// has been drawn: the gap until the next tick is what drawing it cost.

/** A drawn frame slower than this (ms) means decorative slides are skipped. */
export const SLOW_FRAME_MS = 50;

let drewLast = false;
let slow = false;

/** Call at the start of every tick with the real time since the previous tick (ms). */
export function noteTick(elapsedMs: number): void {
  if (drewLast) slow = elapsedMs > SLOW_FRAME_MS;
  drewLast = false;
}

/** Call after a frame was drawn. */
export function noteDraw(): void {
  drewLast = true;
}

/** True if the last drawn frame took longer than SLOW_FRAME_MS. */
export function framesAreSlow(): boolean {
  return slow;
}

/** Tests only. */
export function resetFrameClock(): void {
  drewLast = false;
  slow = false;
}
