// S-05-3: the carousel behind the hand zoom (poses, what slides where) and the
// list zoom's slide-to-index (piles, score pills).
import { describe, expect, it } from 'vitest';
import { CAROUSEL_REACH, CAROUSEL_SLIDE_MS, carouselMoves, carouselPose, listIndex } from '../src/carouselMath';

describe('carouselPose', () => {
  it('the zoomed card is full size in the middle; neighbours get smaller, dimmer and further out', () => {
    expect(carouselPose(0)).toEqual({ dx: 0, scale: 1, alpha: 1, brightness: 1 });
    const one = carouselPose(1);
    const two = carouselPose(2);
    expect(one.dx).toBeGreaterThan(0.5);
    expect(two.dx).toBeGreaterThan(one.dx);
    expect(one.scale).toBeLessThan(1);
    expect(two.scale).toBeLessThan(one.scale);
    expect(one.brightness).toBeLessThan(1);
    expect(two.brightness).toBeLessThan(one.brightness);
    expect(one.alpha).toBeGreaterThan(0.5);
    expect(two.alpha).toBeGreaterThan(0.5);
  });

  it('is mirrored left / right and fades out just past the last neighbour', () => {
    expect(carouselPose(-1).dx).toBeCloseTo(-carouselPose(1).dx);
    expect(carouselPose(-2).scale).toBeCloseTo(carouselPose(2).scale);
    expect(carouselPose(3).alpha).toBe(0);
    expect(carouselPose(-7).alpha).toBe(0);
  });

  it('moves smoothly between slots (a tween of the offset slides the card)', () => {
    const a = carouselPose(1);
    const mid = carouselPose(1.5);
    const b = carouselPose(2);
    expect(mid.dx).toBeGreaterThan(a.dx);
    expect(mid.dx).toBeLessThan(b.dx);
    expect(mid.scale).toBeLessThan(a.scale);
    expect(mid.scale).toBeGreaterThan(b.scale);
  });

  it('the slide is short (≤ 120 ms, tech plan)', () => {
    expect(CAROUSEL_SLIDE_MS).toBeLessThanOrEqual(120);
    expect(CAROUSEL_REACH).toBe(2);
  });
});

describe('carouselMoves', () => {
  it('on open: up to 2 neighbours each side, placed at once', () => {
    expect(carouselMoves(null, 3, 7)).toEqual([
      { index: 1, from: -2, to: -2 },
      { index: 2, from: -1, to: -1 },
      { index: 4, from: 1, to: 1 },
      { index: 5, from: 2, to: 2 },
    ]);
  });

  it('at the ends only the cards that exist are shown', () => {
    expect(carouselMoves(null, 0, 5).map((m) => m.index)).toEqual([1, 2]);
    expect(carouselMoves(null, 4, 5).map((m) => m.index)).toEqual([2, 3]);
    expect(carouselMoves(null, 0, 1)).toEqual([]);
  });

  it('one step right: everything slides one slot left, the old card leaves the middle, one enters from the edge, one leaves', () => {
    const m = carouselMoves(2, 3, 7);
    const by = (i: number) => m.find((x) => x.index === i);
    expect(by(3)).toBeUndefined(); // now zoomed
    expect(by(2)).toEqual({ index: 2, from: 0, to: -1 }); // the card that was zoomed
    expect(by(1)).toEqual({ index: 1, from: -1, to: -2 });
    expect(by(4)).toEqual({ index: 4, from: 2, to: 1 });
    expect(by(5)).toEqual({ index: 5, from: 3, to: 2 }); // enters from the right edge
    expect(by(0)).toEqual({ index: 0, from: -2, to: -3 }); // leaves at the left edge
    expect(m).toHaveLength(5);
  });

  it('a jump of several slots still slides every card from where it was', () => {
    const m = carouselMoves(0, 4, 9);
    for (const x of m) {
      expect(Math.abs(x.from)).toBeLessThanOrEqual(3);
      expect(Math.abs(x.to)).toBeLessThanOrEqual(3);
      expect(x.from).not.toBe(x.to);
    }
    expect(m.find((x) => x.index === 0)).toEqual({ index: 0, from: 0, to: -3 });
  });

  it('every shown slot ends at its own offset', () => {
    for (let n = 1; n <= 9; n++) {
      for (let prev = 0; prev < n; prev++) {
        for (let next = 0; next < n; next++) {
          const shown = carouselMoves(prev, next, n).filter((x) => Math.abs(x.to) <= 2);
          expect(shown.map((x) => x.to)).toEqual(shown.map((x) => x.index - next));
          // Every hand card within 2 slots, except the zoomed one.
          expect(shown).toHaveLength(Math.min(n - 1, next + 2) - Math.max(0, next - 2));
        }
      }
    }
  });
});

describe('listIndex', () => {
  it('steps one card per `step` px from where the hold opened, clamped to the ends', () => {
    expect(listIndex(4, 0, 40, 5)).toBe(4);
    expect(listIndex(4, -39, 40, 5)).toBe(4);
    expect(listIndex(4, -40, 40, 5)).toBe(3);
    expect(listIndex(4, -170, 40, 5)).toBe(0);
    expect(listIndex(4, -900, 40, 5)).toBe(0);
    expect(listIndex(4, 200, 40, 5)).toBe(4);
    expect(listIndex(0, 85, 40, 5)).toBe(2);
    expect(listIndex(0, 10, 40, 0)).toBe(0);
  });
});
