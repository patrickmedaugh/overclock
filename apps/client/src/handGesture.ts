// S-07-6: the hand view's gestures, pure (no Pixi) so they are unit tested in plain Node.
// The board owns the state; these only answer "what is under the finger" and
// "which card does a swipe show".
import type { Box } from './hook-types';

/**
 * S-15-6: how long the big card is held still before it lifts out of the hand view (ms). A
 * release before this (inside the 12 px circle) is a tap: it only shows "Hold to play".
 */
export const HOLD_MS = 250;
/** The S-07-6 name of the same hold. */
export const LIFT_MS = HOLD_MS;
/** Movement (CSS px) that turns a press in the hand view into a swipe or an upward pick-up (no tap). */
export const SWIPE_TOLERANCE = 12;
/** S-15-6: leaving the 12 px circle this close to straight up picks the card up (−dy ≥ UP_RATIO·|dx|: within ~40°). */
export const UP_RATIO = 1.2;
/** S-15-6: during the strip's hold-to-read, a finger this share of a hand card above the strip lifts the card being read. */
export const STRIP_PULL = 0.15;
/** S-15-6: the hand strip drops below the screen while a card is held, and comes back up (ms). */
export const MINIMIZE_MS = 120;
/** S-15-6: how long the "Hold to play" tip stays on the big card after a tap (ms, then it fades). */
export const TIP_MS = 1200;

/** S-15-6: a move of `dx`/`dy` (CSS px, + = right / down) from the press point points up, within ~40° of straight up. */
export function isUpward(dx: number, dy: number): boolean {
  return -dy > 0 && -dy >= UP_RATIO * Math.abs(dx);
}

/** What a press on a card is so far: still undecided, a tap, a pick-up (lift) or a sideways browse (swipe). */
export type PressKind = 'pending' | 'tap' | 'lift' | 'swipe';

/**
 * S-15-6 (Hearthstone's gesture model): sideways = browse, still hold or upward = pick up. Judged
 * by the press's own event times (QA-S3-7), never by when a timer ran: `heldMs` is the time from
 * the down event to the move or release being judged; `dx`/`dy` the farthest the finger had got
 * when it first left the 12 px circle (or where it is, while inside). `released`: the finger is up.
 * - left the circle within 40° of straight up: lift (at once, no wait);
 * - left it any other way: swipe;
 * - inside the circle and released before `HOLD_MS`: tap (even if a late timer lifted it meanwhile);
 * - inside the circle for `HOLD_MS` or more: lift (a release then is a hold, never a tap).
 */
export function classifyPress(dx: number, dy: number, heldMs: number, released: boolean, holdMs = HOLD_MS, tolerance = SWIPE_TOLERANCE): PressKind {
  if (Math.hypot(dx, dy) > tolerance) return isUpward(dx, dy) ? 'lift' : 'swipe';
  if (heldMs >= holdMs) return 'lift';
  return released ? 'tap' : 'pending';
}

/** S-15-6: a straight arrow, from (x1, y1) to (x2, y2) (CSS px). */
export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** True if the segment a→b passes through box `r` (Liang–Barsky clip). */
export function segmentHitsBox(ax: number, ay: number, bx: number, by: number, r: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const edges: [number, number][] = [
    [-dx, ax - r.x],
    [dx, r.x + r.width - ax],
    [-dy, ay - r.y],
    [dy, r.y + r.height - ay],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
  }
  return t0 <= t1;
}

/**
 * S-15-6: the arrow from the held card (`card`: where it is drawn; the arrow starts at its top
 * edge's middle) to `to` (the hovered place's price pill, where the card lands), or null when it
 * would not help: shorter than half a card (`cardH`), off screen, ending under the card itself, or
 * crossing another lit place (`others`: every lit box except the hovered one).
 */
export function arrowFor(card: Box, to: { x: number; y: number }, cardH: number, others: readonly Box[], viewport: { width: number; height: number }): Segment | null {
  const x1 = card.x + card.width / 2;
  const y1 = card.y;
  const { x: x2, y: y2 } = to;
  if (Math.hypot(x2 - x1, y2 - y1) < cardH * 0.5) return null;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x <= viewport.width && y <= viewport.height;
  if (!on(x1, y1) || !on(x2, y2)) return null;
  if (contains(card, x2, y2)) return null;
  for (const b of others) if (segmentHitsBox(x1, y1, x2, y2, b)) return null;
  return { x1, y1, x2, y2 };
}
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
