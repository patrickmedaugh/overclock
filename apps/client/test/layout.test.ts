import { describe, expect, it } from 'vitest';
import type { Box, Insets } from '../src/hook-types';
import { type BoardLayout, MIN_TOUCH, computeLayout, handSlots } from '../src/layout';

const VIEWPORTS: [number, number][] = [
  [390, 844], // reference phone (portrait)
  [360, 640], // small Android
  [375, 667], // older iPhone
  [393, 852], // newer iPhone
  [412, 915], // large Android
  [768, 1024], // tablet portrait
  [1280, 800], // desktop
  [1920, 1080], // large desktop
];

const INSETS: [string, Insets][] = [
  ['none', { top: 0, right: 0, bottom: 0, left: 0 }],
  ['iPhone notch 47/34', { top: 47, right: 0, bottom: 34, left: 0 }],
  ['Android bars 24/48', { top: 24, right: 0, bottom: 48, left: 0 }],
];

const CASES = VIEWPORTS.flatMap(([w, h]) => INSETS.map(([name, i]) => [w, h, name, i] as const));

function inside(b: Box, r: Box): boolean {
  const e = 0.001;
  return b.width > 0 && b.height > 0 && b.x >= r.x - e && b.y >= r.y - e && b.x + b.width <= r.x + r.width + e && b.y + b.height <= r.y + r.height + e;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function safeRect(w: number, h: number, i: Insets): Box {
  return { x: i.left, y: i.top, width: w - i.left - i.right, height: h - i.top - i.bottom };
}

/** Every element drawn on the board (they must not overlap each other). */
function elements(l: BoardLayout): [string, Box][] {
  const out: [string, Box][] = [];
  for (const pos of ['top', 'bottom'] as const) {
    for (const k of ['label', 'credits', 'clicks', 'discard', 'deck'] as const) out.push([`${pos}.${k}`, l[pos][k]]);
  }
  out.push(['banner', l.banner], ['sub', l.sub], ['hintArea', l.hintArea], ['endTurn', l.endTurn], ['hand', l.handArea]);
  return out;
}

describe('computeLayout', () => {
  it.each(CASES)('%ix%i, insets %s: everything is inside the safe area and nothing overlaps', (w, h, _n, insets) => {
    const l = computeLayout(w, h, insets);
    const safe = safeRect(w, h, insets);
    expect(l.safe).toEqual(safe);
    const named = [...elements(l), ['gameOver', l.gameOver] as [string, Box], ['zoom', l.zoom] as [string, Box]];
    for (const [name, b] of named) expect(inside(b, safe), `${name} ${JSON.stringify(b)} inside safe ${JSON.stringify(safe)}`).toBe(true);
    const flat = elements(l);
    for (let i = 0; i < flat.length; i++) {
      for (let j = i + 1; j < flat.length; j++) {
        const [an, a] = flat[i]!;
        const [bn, b] = flat[j]!;
        expect(overlaps(a, b), `${an} vs ${bn}`).toBe(false);
      }
    }
  });

  it.each(CASES)('%ix%i, insets %s: opponent row on top, then center, viewer row, hand at the bottom', (w, h, _n, insets) => {
    const l = computeLayout(w, h, insets);
    expect(l.top.row.y + l.top.row.height).toBeLessThanOrEqual(l.center.y);
    expect(l.center.y + l.center.height).toBeLessThanOrEqual(l.bottom.row.y);
    expect(l.bottom.row.y + l.bottom.row.height).toBeLessThanOrEqual(l.handArea.y);
    // The End turn button and the hint live in the center band.
    expect(inside(l.endTurn, l.center)).toBe(true);
    expect(inside(l.hintArea, l.center)).toBe(true);
    expect(l.endTurn.x + l.endTurn.width).toBe(l.center.x + l.center.width);
  });

  it.each(CASES)('%ix%i, insets %s: tap targets are at least 44px', (w, h, _n, insets) => {
    const l = computeLayout(w, h, insets);
    for (const b of [l.bottom.deck, l.bottom.credits, l.endTurn, l.card]) {
      expect(b.width).toBeGreaterThanOrEqual(MIN_TOUCH);
      expect(b.height).toBeGreaterThanOrEqual(MIN_TOUCH);
    }
  });

  it('a notch and gesture bar push the board inside the safe area', () => {
    const plain = computeLayout(390, 844);
    const notched = computeLayout(390, 844, { top: 47, bottom: 34 });
    expect(notched.top.row.y).toBeGreaterThanOrEqual(47);
    expect(notched.handArea.y + notched.handArea.height).toBeLessThanOrEqual(844 - 34);
    expect(plain.top.row.y).toBeLessThan(notched.top.row.y);
  });

  it('left/right insets (landscape notch) keep the column inside', () => {
    const l = computeLayout(1280, 800, { left: 48, right: 48 });
    expect(l.board.x).toBeGreaterThanOrEqual(48);
    expect(l.board.x + l.board.width).toBeLessThanOrEqual(1280 - 48);
  });

  it('ignores junk inset values', () => {
    const l = computeLayout(390, 844, { top: Number.NaN, bottom: -5 });
    expect(l.insets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('zoomed card is larger than a hand card', () => {
    for (const [w, h] of VIEWPORTS) {
      const l = computeLayout(w, h);
      expect(l.zoom.width).toBeGreaterThan(l.card.width * 2.5);
    }
  });
});

describe('handSlots', () => {
  it.each(CASES)('%ix%i, insets %s: up to 15 cards stay inside the hand area with 44px visible', (w, h, _n, insets) => {
    const l = computeLayout(w, h, insets);
    for (let n = 1; n <= 15; n++) {
      const slots = handSlots(l, n);
      expect(slots).toHaveLength(n);
      for (const s of slots) expect(inside(s, l.handArea)).toBe(true);
      for (let i = 1; i < slots.length; i++) {
        const a = slots[i - 1]!;
        const b = slots[i]!;
        if (a.y === b.y) expect(b.x - a.x).toBeGreaterThanOrEqual(MIN_TOUCH - 0.001);
      }
    }
  });

  it.each(CASES)('%ix%i, insets %s: up to 10 cards never overlap', (w, h, _n, insets) => {
    const l = computeLayout(w, h, insets);
    for (let n = 1; n <= 10; n++) {
      const slots = handSlots(l, n);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(overlaps(slots[i]!, slots[j]!)).toBe(false);
    }
  });

  it('fits 5 per row on the reference phone, wrapping 6-10 into two rows', () => {
    const l = computeLayout(390, 844);
    expect(new Set(handSlots(l, 5).map((s) => s.y)).size).toBe(1);
    for (let n = 6; n <= 10; n++) expect(new Set(handSlots(l, n).map((s) => s.y)).size).toBe(2);
  });
});
