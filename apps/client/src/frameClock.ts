// How long a drawn frame takes on this device (S-05-3). Decorative motion that
// would only add more slow frames (the carousel slide, the held card's lean) is
// skipped when drawing a frame is slow, so it never holds up the next touch. A
// frame counts once it has been drawn: the gap until the next tick is what
// drawing it cost.
//
// QA-S15-3 (DECISIONS 2026-11-21): decorative motion keeps frames coming, and a
// finger move that arrives while one is drawn waits for it and the next, so a move
// is shown up to ~2 frames late. The bar is therefore 40 ms (2 x 40 < 100 ms input
// budget), not the old 50 ms: browsers time frames in whole screen refreshes, so a
// 20-a-second device measured exactly 50.0 ms, counted as "not slow", turned the
// lean on and dragged cards 130-170 ms late. And one quick frame among slow ones no
// longer turns decorative motion back on: it takes FAST_FRAMES_TO_RESUME in a row.

/** A drawn frame slower than this (ms) means decorative motion is skipped. */
export const SLOW_FRAME_MS = 40;
/** After a slow frame, this many quick drawn frames in a row before decorative motion returns. */
export const FAST_FRAMES_TO_RESUME = 3;

let drewLast = false;
let slow = false;
/** Quick drawn frames in a row since the last slow one. */
let fastRun = 0;
/** Tests only: pins the answer of framesAreSlow() (null: measured). */
let forced: boolean | null = null;

/** Call at the start of every tick with the real time since the previous tick (ms). */
export function noteTick(elapsedMs: number): void {
  if (drewLast) {
    if (elapsedMs > SLOW_FRAME_MS) {
      slow = true;
      fastRun = 0;
    } else if (slow && ++fastRun >= FAST_FRAMES_TO_RESUME) {
      slow = false;
      fastRun = 0;
    }
  }
  drewLast = false;
}

/** Call after a frame was drawn. */
export function noteDraw(): void {
  drewLast = true;
}

/** True once a drawn frame took longer than SLOW_FRAME_MS, until FAST_FRAMES_TO_RESUME quick ones in a row. */
export function framesAreSlow(): boolean {
  return forced ?? slow;
}

/**
 * Tests only (the Playwright hook): 'fast' / 'slow' pins framesAreSlow(), so CI
 * (a software GPU, where frames are always slow) still exercises the slide;
 * 'measured' goes back to timing real frames.
 */
export function forceFrameSpeed(mode: 'fast' | 'slow' | 'measured'): void {
  forced = mode === 'measured' ? null : mode === 'slow';
}

/** Tests only. */
export function resetFrameClock(): void {
  drewLast = false;
  slow = false;
  fastRun = 0;
  forced = null;
}
