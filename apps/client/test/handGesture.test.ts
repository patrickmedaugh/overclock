// S-07-6: the hand view's gestures (what a press is on, swipe to browse,
// which lit place a dragged card is over, where the lifted card is drawn).
import { describe, expect, it } from 'vitest';
import { HOLD_MS, LIFT_MS, MINIMIZE_MS, RETURN_MS, VIEW_FADE_MS, arrowFor, classifyPress, ghostCenter, isUpward, segmentHitsBox, swipeIndex, targetAt, viewHit } from '../src/handGesture';

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
    // S-15-6: the hold is a quarter of a second (was 0.35 s).
    expect(LIFT_MS).toBe(250);
    expect(HOLD_MS).toBe(250);
    expect(MINIMIZE_MS).toBeLessThanOrEqual(120);
    expect(VIEW_FADE_MS).toBeLessThanOrEqual(120);
    expect(RETURN_MS).toBeLessThanOrEqual(150);
  });
});

describe('leanAngle (S-15-1)', () => {
  it('leans the way the finger moves, more when faster, capped at 14 degrees', async () => {
    const { leanAngle, LEAN_MAX } = await import('../src/handGesture');
    const slow = leanAngle(0.3, 0, 40);
    const fast = leanAngle(1.2, 0, 40);
    expect(slow).toBeGreaterThan(0);
    expect(fast).toBeGreaterThan(slow);
    expect(leanAngle(-1, 0, 40)).toBeLessThan(0);
    expect(leanAngle(50, 0, 1000)).toBeCloseTo(LEAN_MAX);
    expect(leanAngle(-50, 0, 1000)).toBeCloseTo(-LEAN_MAX);
  });
  it('eases toward the target and straightens when the finger stops', async () => {
    const { leanAngle } = await import('../src/handGesture');
    const half = leanAngle(1, 0, 20);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(leanAngle(1, 0, 40));
    expect(leanAngle(0, 0.2, 40)).toBe(0);
    expect(leanAngle(1, 0.1, 0)).toBe(0.1);
  });
});

describe('classifyPress (S-15-6: sideways = browse, still hold or upward = pick up)', () => {
  it('a quick still press is a tap; held still for 250 ms it lifts', () => {
    expect(classifyPress(0, 0, 0, false)).toBe('pending');
    expect(classifyPress(3, -4, 120, true)).toBe('tap');
    expect(classifyPress(0, 0, 249, true)).toBe('tap');
    expect(classifyPress(0, 0, 249, false)).toBe('pending');
    expect(classifyPress(0, 0, 250, false)).toBe('lift');
    // Let go after the hold time: a hold, never a tap (no accidental plays).
    expect(classifyPress(0, 0, 400, true)).toBe('lift');
  });

  it('a timer that ran late is undone by a quick release: judged by the press\'s own times', () => {
    // The page stalled 600 ms; the lift timer ran, but the finger was down 90 ms (its events say so).
    expect(classifyPress(1, 1, 90, true)).toBe('tap');
  });

  it('leaving the 12 px circle (nearly) straight up lifts at once; sideways or down browses', () => {
    expect(classifyPress(0, -13, 20, false)).toBe('lift');
    expect(classifyPress(9, -13, 20, false)).toBe('lift'); // ~35 degrees off vertical
    expect(classifyPress(12, -13, 20, false)).toBe('swipe'); // ~43 degrees: a browse
    expect(classifyPress(-20, 0, 20, false)).toBe('swipe');
    expect(classifyPress(20, -5, 20, false)).toBe('swipe');
    expect(classifyPress(0, 20, 20, false)).toBe('swipe');
    // Diagonal flicks the way a thumb browses stay a browse.
    for (const [dx, dy] of [[14, -10], [-16, -12], [20, -15], [-13, -3]] as const) expect(classifyPress(dx, dy, 30, false)).toBe('swipe');
  });

  it('isUpward: within ~40 degrees of straight up', () => {
    expect(isUpward(0, -1)).toBe(true);
    expect(isUpward(10, -12)).toBe(true);
    expect(isUpward(-10, -12)).toBe(true);
    expect(isUpward(11, -12)).toBe(false);
    expect(isUpward(0, 1)).toBe(false);
    expect(isUpward(0, 0)).toBe(false);
  });
});

describe('arrowFor (S-15-6: an arrow only where it helps)', () => {
  const vp = { width: 891, height: 296 };
  const card = box(400, 150, 43, 60);
  it('goes from the top of the held card to the price pill', () => {
    expect(arrowFor(card, { x: 300, y: 40 }, 56, [], vp)).toEqual({ x1: 421.5, y1: 150, x2: 300, y2: 40 });
  });
  it('none when shorter than half a card, off screen, or ending under the card', () => {
    expect(arrowFor(card, { x: 430, y: 130 }, 56, [], vp)).toBeNull();
    expect(arrowFor(card, { x: 300, y: -5 }, 56, [], vp)).toBeNull();
    expect(arrowFor(card, { x: 420, y: 200 }, 56, [], vp)).toBeNull();
  });
  it('none when it would cross another lit place', () => {
    expect(arrowFor(card, { x: 300, y: 40 }, 56, [box(340, 80, 30, 30)], vp)).toBeNull();
    expect(arrowFor(card, { x: 300, y: 40 }, 56, [box(600, 80, 30, 30)], vp)).not.toBeNull();
  });
  it('segmentHitsBox', () => {
    expect(segmentHitsBox(0, 0, 10, 10, box(4, 4, 2, 2))).toBe(true);
    expect(segmentHitsBox(0, 0, 10, 0, box(4, 4, 2, 2))).toBe(false);
    expect(segmentHitsBox(0, 5, 3, 5, box(4, 4, 2, 2))).toBe(false);
    expect(segmentHitsBox(5, 0, 5, 10, box(4, 4, 2, 2))).toBe(true);
  });
});
