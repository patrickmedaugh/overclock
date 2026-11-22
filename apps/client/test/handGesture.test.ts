// S-07-6: the hand view's gestures (what a press is on, swipe to browse,
// which lit place a dragged card is over, where the lifted card is drawn).
import { describe, expect, it } from 'vitest';
import { HAND_BACK_DELAY_MS, HELD_MAX_SHARE, HOLD_MS, LIFT_MS, MINIMIZE_MS, MOVE_TOLERANCE, RETURN_MS, STRIP_UP_RATIO, VIEW_FADE_MS, arrowFor, classifyPress, ghostCenter, heldAside, heldCenter, heldScale, isUpward, segmentHitsBox, stripPickUp, swipeIndex, targetAt, viewHit } from '../src/handGesture';

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
    expect(viewHit(155, 350, centre, neighbours, strip)).toEqual({ kind: 'card', index: 1, strip: true });
    expect(viewHit(105, 350, centre, neighbours, strip)).toEqual({ kind: 'card', index: 0, strip: true });
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
    // S-15-6: the hold was a quarter of a second (was 0.35 s); owner round 3 (2026-11-22): "anything
    // longer than a quick tap should grab the card" (a quick tap is ~50-100 ms).
    expect(LIFT_MS).toBe(120);
    expect(HOLD_MS).toBe(120);
    expect(HOLD_MS).toBeGreaterThan(100);
    expect(MOVE_TOLERANCE).toBeGreaterThanOrEqual(6);
    expect(MOVE_TOLERANCE).toBeLessThanOrEqual(8);
    expect(MINIMIZE_MS).toBeLessThanOrEqual(120);
    expect(VIEW_FADE_MS).toBeLessThanOrEqual(120);
    // S-15-6 (owner review 2026-11-21): the glide is a little slower so it is seen, and the hand
    // comes back up only after it (a short pause); the whole return still fits the 0.6 s rule.
    expect(RETURN_MS).toBeLessThanOrEqual(200);
    expect(HAND_BACK_DELAY_MS).toBeGreaterThanOrEqual(150);
    expect(HAND_BACK_DELAY_MS).toBeLessThanOrEqual(250);
    expect(HAND_BACK_DELAY_MS + MINIMIZE_MS).toBeLessThanOrEqual(600);
    expect(Math.max(RETURN_MS, HAND_BACK_DELAY_MS + MINIMIZE_MS)).toBeLessThanOrEqual(600);
  });
});

describe('heldScale (S-15-6 owner review: a bigger held card; round 3: bigger still)', () => {
  // [viewport w, h, hand card h, big card h, held h before round 3] from computeLayout.
  const sizes = [
    [844, 390, 77, 358, 164],
    [640, 360, 72, 332, 151],
    [891, 296, 56, 273, 124],
    [1280, 800, 113, 588, 336],
  ] as const;
  it('is 1.5x the held size before owner round 3 at every tested size, capped at 63% of the screen height', () => {
    for (const [, vh, cardH, zoomH, before] of sizes) {
      const h = cardH * heldScale(cardH, zoomH, vh);
      expect(h / before, `${vh} tall`).toBeGreaterThan(1.45);
      expect(h / before, `${vh} tall`).toBeLessThan(1.55);
      expect(h).toBeLessThanOrEqual(vh * HELD_MAX_SHARE + 0.01);
    }
    // 844x390: 246 px tall (was 164); 640x360: 227 (was 151).
    expect(77 * heldScale(77, 358, 390)).toBeCloseTo(390 * 0.63);
    expect(72 * heldScale(72, 332, 360)).toBeCloseTo(360 * 0.63);
  });
  it('never taller than the hand view\'s big card', () => {
    expect(100 * heldScale(100, 300, 1000)).toBeCloseTo(300);
  });
  it('still fits wholly on screen above a finger on the hand (640x360, 52x72 hand card)', () => {
    const s = heldScale(72, 332, 360);
    const w = 52 * s;
    const h = 72 * s;
    const c = heldCenter(320, 320, w, h, 640, 360);
    expect(c.y - h / 2).toBeGreaterThanOrEqual(0);
    expect(c.y + h / 2).toBeLessThanOrEqual(320);
    expect(c.x - w / 2).toBeGreaterThanOrEqual(0);
    expect(c.x + w / 2).toBeLessThanOrEqual(640);
  });
  it('never smaller than the old held size', () => {
    expect(heldScale(100, 90, 200)).toBe(1.08);
    expect(heldScale(0, 90, 200)).toBe(1.08);
  });
});

describe('heldCenter (S-15-6 owner review: the held card never hides the place under the finger)', () => {
  const W = 89;
  const H = 124;
  const covers = (c: { x: number; y: number }, x: number, y: number) => Math.abs(c.x - x) <= W / 2 && Math.abs(c.y - y) <= H / 2;
  it('sits wholly above the finger when there is room', () => {
    const c = heldCenter(400, 250, W, H, 891, 296);
    expect(c.x).toBe(400);
    expect(c.y + H / 2).toBeLessThan(250);
  });
  it('slides beside the finger near the top, never over it', () => {
    for (const y of [0, 20, 60, 100, 120]) {
      const c = heldCenter(400, y, W, H, 891, 296);
      expect(covers(c, 400, y), `finger at y=${y}`).toBe(false);
      expect(c.y - H / 2).toBeGreaterThanOrEqual(0);
    }
    // At the right edge it goes to the left.
    expect(heldCenter(880, 40, W, H, 891, 296).x).toBeLessThan(880);
  });
  it('moves smoothly (no jump) as the finger rises past the top room', () => {
    let prev = heldCenter(400, 200, W, H, 891, 296);
    for (let y = 199; y >= 0; y--) {
      const c = heldCenter(400, y, W, H, 891, 296);
      expect(Math.hypot(c.x - prev.x, c.y - prev.y)).toBeLessThan(6);
      prev = c;
    }
  });
});

describe('stripPickUp (S-15-6 owner round 3: any drag out of the small hand picks the card up)', () => {
  it('up, diagonal and sideways pick up; mostly down does not', () => {
    expect(stripPickUp(0, -8)).toBe(true);
    expect(stripPickUp(6, -5)).toBe(true); // diagonal
    expect(stripPickUp(-8, 0)).toBe(true); // sideways: the strip has no browse of its own
    expect(stripPickUp(8, 3)).toBe(true); // sideways, a little down
    expect(stripPickUp(0, 8)).toBe(false);
    expect(stripPickUp(4, 7)).toBe(false);
    expect(STRIP_UP_RATIO).toBeLessThan(1);
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
  it('a quick still press is a tap; held still for 120 ms it lifts', () => {
    expect(classifyPress(0, 0, 0, false)).toBe('pending');
    expect(classifyPress(3, -4, 100, true)).toBe('tap');
    expect(classifyPress(0, 0, 119, true)).toBe('tap');
    expect(classifyPress(0, 0, 119, false)).toBe('pending');
    expect(classifyPress(0, 0, 120, false)).toBe('lift');
    // Let go after the hold time: a hold, never a tap (no accidental plays).
    expect(classifyPress(0, 0, 400, true)).toBe('lift');
  });

  it('a timer that ran late is undone by a quick release: judged by the press\'s own times', () => {
    // The page stalled 600 ms; the lift timer ran, but the finger was down 90 ms (its events say so).
    expect(classifyPress(1, 1, 90, true)).toBe('tap');
  });

  it('leaving the 7 px circle up or diagonally lifts at once; sideways or down browses', () => {
    expect(classifyPress(0, -8, 20, false)).toBe('lift');
    expect(classifyPress(5, -6, 20, false)).toBe('lift'); // ~40 degrees off vertical
    expect(classifyPress(6, -6, 20, false)).toBe('lift'); // 45 degrees: a diagonal grabs
    expect(classifyPress(-7, -6, 20, false)).toBe('lift'); // ~49 degrees
    expect(classifyPress(8, -5, 20, false)).toBe('swipe'); // ~58 degrees: a browse
    expect(classifyPress(-8, 0, 20, false)).toBe('swipe');
    expect(classifyPress(0, 8, 20, false)).toBe('swipe');
    // Flat flicks with a little rise, the way a thumb browses, stay a browse.
    for (const [dx, dy] of [[14, -10], [-16, -12], [20, -15], [-13, -3], [8, -3]] as const) expect(classifyPress(dx, dy, 30, false)).toBe('swipe');
  });

  it('isUpward: within ~51 degrees of straight up', () => {
    expect(isUpward(0, -1)).toBe(true);
    expect(isUpward(10, -10)).toBe(true);
    expect(isUpward(-12, -10)).toBe(true);
    expect(isUpward(13, -10)).toBe(false);
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

describe('heldAside (QA round 7 note: the hovered place\'s price and name stay readable)', () => {
  const W = 89;
  const H = 124;
  const overlapX = (cx: number, b: { x: number; width: number }) => cx + W / 2 > b.x && cx - W / 2 < b.x + b.width;
  it('moves the card off a place on the left side toward the screen centre (right)', () => {
    const hq = box(0, 80, 60, 150);
    const c = heldCenter(30, 210, W, H, 891, 296);
    const dx = heldAside(c.x, c.y, W, H, hq, 891);
    expect(dx).toBeGreaterThan(0);
    expect(overlapX(c.x + dx, hq)).toBe(false);
    expect(c.x + dx + W / 2).toBeLessThanOrEqual(891);
  });
  it('moves it left off a place on the right half', () => {
    const p = box(600, 80, 60, 150);
    const c = heldCenter(630, 210, W, H, 891, 296);
    const dx = heldAside(c.x, c.y, W, H, p, 891);
    expect(dx).toBeLessThan(0);
    expect(overlapX(c.x + dx, p)).toBe(false);
  });
  it('goes the other way when there is no room toward the centre', () => {
    const p = box(380, 80, 60, 150);
    // Toward the centre would be right (place left of 445), but a narrow screen leaves no room there.
    const dx = heldAside(410, 100, W, H, p, 520);
    expect(410 + dx + W / 2).toBeLessThanOrEqual(380);
  });
  it('stays put when it does not overlap the place, or the place is too wide to step off', () => {
    expect(heldAside(400, 60, W, H, box(0, 200, 60, 90), 891)).toBe(0);
    expect(heldAside(400, 100, W, H, box(20, 80, 850, 150), 891)).toBe(0);
  });
});
