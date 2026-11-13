// S-05-3: the carousel's geometry and moves, pure (no Pixi) so it is unit tested in plain Node.

/** Neighbours shown each side of the zoomed card. */
export const CAROUSEL_REACH = 2;
/** The slide when the zoom moves on (ms, ≤ 120 by the tech plan). */
export const CAROUSEL_SLIDE_MS = 110;
/** Offset a card leaves to / enters from (just past the last shown neighbour). */
const EDGE = CAROUSEL_REACH + 1;

/** How a card `o` slots from the zoomed one is drawn. `dx` and `scale` are in zoom-card widths / sizes. */
export interface CarouselPose {
  dx: number;
  scale: number;
  alpha: number;
  /** 1 = full brightness; lower = dimmed. */
  brightness: number;
}

/** Poses at |o| = 0, 1, 2, 3 (3: faded out, just past the edge). Between knots: linear. */
const KNOTS: readonly CarouselPose[] = [
  { dx: 0, scale: 1, alpha: 1, brightness: 1 },
  { dx: 0.62, scale: 0.72, alpha: 1, brightness: 0.5 },
  { dx: 1.04, scale: 0.52, alpha: 0.9, brightness: 0.36 },
  { dx: 1.34, scale: 0.4, alpha: 0, brightness: 0.3 },
];

export function carouselPose(o: number): CarouselPose {
  const a = Math.min(Math.abs(o), EDGE);
  const i = Math.min(Math.floor(a), KNOTS.length - 2);
  const t = a - i;
  const p = KNOTS[i]!;
  const q = KNOTS[i + 1]!;
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return { dx: Math.sign(o) * lerp(p.dx, q.dx), scale: lerp(p.scale, q.scale), alpha: lerp(p.alpha, q.alpha), brightness: lerp(p.brightness, q.brightness) };
}

/** One neighbour's move: hand index, the offset it starts at, the offset it ends at (±EDGE: it leaves). */
export interface CarouselMove {
  index: number;
  from: number;
  to: number;
}

/**
 * What moves when the zoom goes from hand index `prev` (null: it just opened)
 * to `next`, in a hand of `count`. Neighbours entering slide in from where they
 * sat relative to `prev` (or the edge); `prev` itself leaves the middle; ones
 * now too far slide out to the edge. The zoomed card (`next`) is not listed.
 */
export function carouselMoves(prev: number | null, next: number, count: number, reach = CAROUSEL_REACH): CarouselMove[] {
  const edge = reach + 1;
  const clamp = (o: number) => Math.max(-edge, Math.min(edge, o));
  const out: CarouselMove[] = [];
  for (let i = Math.max(0, next - reach); i <= Math.min(count - 1, next + reach); i++) {
    if (i === next) continue;
    const to = i - next;
    out.push({ index: i, from: prev === null ? to : clamp(i - prev), to });
  }
  if (prev !== null) {
    for (let i = Math.max(0, prev - reach); i <= Math.min(count - 1, prev + reach); i++) {
      if (Math.abs(i - next) <= reach) continue;
      out.push({ index: i, from: i - prev, to: Math.sign(i - next) * edge });
    }
  }
  return out;
}

/**
 * The hold-and-slide index on a list zoom (a pile or a score pill): each `step`
 * px the finger moves sideways from where the hold opened is one card.
 * Sliding right goes to later cards, clamped to the list's ends.
 */
export function listIndex(start: number, dx: number, step: number, count: number): number {
  if (count <= 0) return 0;
  const i = start + Math.trunc(dx / Math.max(1, step));
  return Math.max(0, Math.min(count - 1, i));
}
