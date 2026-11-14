// S-07-6: the hand view's gestures (what a press is on, swipe to browse,
// which lit place a dragged card is over, where the lifted card is drawn).
import { describe, expect, it } from 'vitest';
import { LIFT_MS, RETURN_MS, VIEW_FADE_MS, ghostCenter, swipeIndex, targetAt, viewHit } from '../src/handGesture';

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe('viewHit', () => {
  const centre = box(300, 20, 200, 280);
  const neighbours = [
    { index: 1, offset: -2, box: box(150, 80, 100, 140) },
    { index: 2, offset: -1, box: box(200, 60, 140, 200) },
    { index: 4, offset: 1, box: box(460, 60, 140, 200) },
  ];
  const strip = [box(100, 330, 60, 60), box(150, 330, 60, 60), box(200, 330, 60, 60)];

  it('the big card wins over the neighbours it overlaps', () => {
    expect(viewHit(320, 100, centre, neighbours, strip)).toEqual({ kind: 'centre' });
  });

  it('the nearer neighbour wins where two overlap', () => {
    expect(viewHit(230, 120, centre, neighbours, strip)).toEqual({ kind: 'card', index: 2 });
    expect(viewHit(160, 120, centre, neighbours, strip)).toEqual({ kind: 'card', index: 1 });
    expect(viewHit(590, 120, centre, neighbours, strip)).toEqual({ kind: 'card', index: 4 });
  });

  it('the hand strip under the view: the card drawn on top (later) wins', () => {
    expect(viewHit(155, 350, centre, neighbours, strip)).toEqual({ kind: 'card', index: 1 });
    expect(viewHit(105, 350, centre, neighbours, strip)).toEqual({ kind: 'card', index: 0 });
  });

  it('anything else is outside', () => {
    expect(viewHit(10, 10, centre, neighbours, strip)).toEqual({ kind: 'outside' });
    expect(viewHit(700, 350, centre, neighbours, strip)).toEqual({ kind: 'outside' });
  });
});

describe('swipeIndex', () => {
  it('dragging left brings later cards in, one per step, clamped to the hand', () => {
    expect(swipeIndex(2, 0, 80, 6)).toBe(2);
    expect(swipeIndex(2, -79, 80, 6)).toBe(2);
    expect(swipeIndex(2, -80, 80, 6)).toBe(3);
    expect(swipeIndex(2, -250, 80, 6)).toBe(5);
    expect(swipeIndex(2, -1000, 80, 6)).toBe(5);
    expect(swipeIndex(2, 160, 80, 6)).toBe(0);
    expect(swipeIndex(2, 1000, 80, 6)).toBe(0);
  });

  it('an empty hand stays at 0', () => {
    expect(swipeIndex(0, -500, 80, 0)).toBe(0);
  });
});

describe('targetAt', () => {
  const column = box(100, 0, 80, 300);
  const rig = box(0, 200, 400, 100);
  it('finds the place under the finger, or -1', () => {
    expect(targetAt(140, 50, [column, rig])).toBe(0);
    expect(targetAt(300, 250, [column, rig])).toBe(1);
    expect(targetAt(600, 250, [column, rig])).toBe(-1);
  });
  it('the smaller of two nested places wins', () => {
    expect(targetAt(140, 250, [rig, column])).toBe(1);
    expect(targetAt(140, 250, [column, rig])).toBe(0);
  });
  it('edges count as inside', () => {
    expect(targetAt(100, 0, [column])).toBe(0);
    expect(targetAt(180, 300, [column])).toBe(0);
  });
});

describe('ghostCenter', () => {
  it('sits above the finger', () => {
    const g = ghostCenter(400, 300, 60, 84, 844, 390);
    expect(g.x).toBe(400);
    expect(g.y).toBeLessThan(300);
    expect(300 - g.y).toBeCloseTo(84 * 0.35);
  });
  it('stays on screen at the edges', () => {
    expect(ghostCenter(0, 0, 60, 84, 844, 390)).toEqual({ x: 30, y: 42 });
    expect(ghostCenter(844, 390, 60, 84, 844, 390)).toEqual({ x: 814, y: 390 - 42 });
  });
});

describe('timings', () => {
  it('stay inside the tech plan budgets', () => {
    expect(LIFT_MS).toBe(350);
    expect(VIEW_FADE_MS).toBeLessThanOrEqual(120);
    expect(RETURN_MS).toBeLessThanOrEqual(150);
  });
});
