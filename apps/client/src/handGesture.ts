// S-07-6: the hand view's gestures, pure (no Pixi) so they are unit tested in plain Node.
// The board owns the state; these only answer "what is under the finger" and
// "which card does a swipe show".
import type { Box } from './hook-types';

/** How long the centre card is held (no move) before it lifts out of the hand view (ms). */
export const LIFT_MS = 350;
/** Movement (CSS px) that turns a press in the hand view into a swipe (no tap, no lift). */
export const SWIPE_TOLERANCE = 12;
/** The hand view fades out when a card lifts (ms, ≤ 120 by the tech plan). */
export const VIEW_FADE_MS = 100;
/** A lifted card let go away from a lit place flies back to the hand (ms, ≤ 150 by the tech plan). */
export const RETURN_MS = 140;
/** Online: how long a dropped card waits on its place for the service's answer before it goes back (ms). */
export const DROP_WAIT_MS = 6000;

export function contains(b: Box, x: number, y: number): boolean {
  return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
}

/** What a press in the open hand view is on. */
export type ViewHit = { kind: 'centre' } | { kind: 'card'; index: number } | { kind: 'outside' };

/**
 * The centre (big) card first, then the neighbours nearest it first (they are
 * drawn over the further ones), then the hand strip under the dimmed board.
 * Anything else is outside (a tap there closes the view).
 */
export function viewHit(
  x: number,
  y: number,
  centre: Box,
  neighbours: readonly { index: number; offset: number; box: Box }[],
  strip: readonly Box[],
): ViewHit {
  if (contains(centre, x, y)) return { kind: 'centre' };
  const near = [...neighbours].sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset));
  for (const n of near) if (contains(n.box, x, y)) return { kind: 'card', index: n.index };
  for (let i = strip.length - 1; i >= 0; i--) if (contains(strip[i]!, x, y)) return { kind: 'card', index: i };
  return { kind: 'outside' };
}

/**
 * The card a swipe shows: dragging the cards left (`dx` < 0) brings later
 * cards to the centre, one per `step` px, clamped to the hand's ends.
 */
export function swipeIndex(start: number, dx: number, step: number, count: number): number {
  if (count <= 0) return 0;
  const i = start - Math.trunc(dx / Math.max(1, step));
  return Math.max(0, Math.min(count - 1, i));
}

/**
 * Index of the place under the finger, or -1. When places nest (a server
 * column inside a larger area) the smallest one wins: it is the one the
 * player aimed at.
 */
export function targetAt(x: number, y: number, boxes: readonly Box[]): number {
  let best = -1;
  let bestArea = Infinity;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]!;
    if (!contains(b, x, y)) continue;
    const area = b.width * b.height;
    if (area < bestArea) {
      best = i;
      bestArea = area;
    }
  }
  return best;
}

/**
 * Where the lifted card's centre goes for a finger at x/y: above the finger
 * (so the thumb does not hide it), kept on screen.
 */
export function ghostCenter(x: number, y: number, cardW: number, cardH: number, vw: number, vh: number, out = { x: 0, y: 0 }): { x: number; y: number } {
  // Written into `out` (the move handler reuses one object: no allocation per move).
  out.x = Math.max(cardW / 2, Math.min(vw - cardW / 2, x));
  out.y = Math.max(cardH / 2, Math.min(vh - cardH / 2, y - cardH * 0.35));
  return out;
}

/** Sprint 15 (S-15-1): the most a dragged card leans (radians, 14°). */
export const LEAN_MAX = (14 * Math.PI) / 180;
/** Lean per finger speed (radians per px/ms): about 1.5 px/ms (a brisk drag) reaches the maximum. */
export const LEAN_PER_SPEED = LEAN_MAX / 1.5;
/** How fast the lean follows the finger (ms to close most of the gap) and straightens once it stops. */
export const LEAN_FOLLOW_MS = 40;
export const LEAN_SETTLE_MS = 80;
/** S-15-1: the big card rises and grows when pressed (scale, ms); the rise is this share of a hand card's height. */
export const PRESS_SCALE = 1.08;
export const PRESS_MS = 80;
export const PRESS_RISE = 0.1;

/**
 * S-15-1: how far a dragged card leans (radians, + = clockwise: its top leans right) given the
 * finger's sideways speed `vx` (px/ms, + = right), the lean before (`prev`) and the time since
 * (`dt` ms). Faster moves lean more (capped at ±14°); the lean eases toward its target, so a
 * jittery finger doesn't shake the card.
 */
export function leanAngle(vx: number, prev: number, dt: number): number {
  const target = Math.max(-LEAN_MAX, Math.min(LEAN_MAX, vx * LEAN_PER_SPEED));
  if (!Number.isFinite(dt) || dt <= 0) return prev;
  const k = Math.min(1, dt / LEAN_FOLLOW_MS);
  const out = prev + (target - prev) * k;
  return Math.max(-LEAN_MAX, Math.min(LEAN_MAX, out));
}
