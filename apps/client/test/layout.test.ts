import { describe, expect, it } from 'vitest';
import type { Box } from '../src/hook-types';
import { MIN_TOUCH, computeLayout, handSlots } from '../src/layout';

const VIEWPORTS: [number, number][] = [
  [390, 844], // reference phone (portrait)
  [360, 640], // small Android
  [375, 667], // older iPhone
  [412, 915], // large Android
  [768, 1024], // tablet portrait
  [1280, 800], // desktop
  [1920, 1080], // large desktop
];

function inside(b: Box, w: number, h: number): boolean {
  return b.x >= 0 && b.y >= 0 && b.x + b.width <= w + 0.001 && b.y + b.height <= h + 0.001;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe('computeLayout', () => {
  it.each(VIEWPORTS)('%ix%i: every board element is on screen and nothing overlaps', (w, h) => {
    const l = computeLayout(w, h);
    const named: [string, Box][] = [
      ['corp.deck', l.corp.deck],
      ['corp.credits', l.corp.credits],
      ['corp.clicks', l.corp.clicks],
      ['corp.label', l.corp.label],
      ['runner.deck', l.runner.deck],
      ['runner.credits', l.runner.credits],
      ['runner.clicks', l.runner.clicks],
      ['runner.label', l.runner.label],
      ['hand', l.handArea],
    ];
    for (const [name, b] of named) {
      expect(inside(b, w, h), `${name} inside ${w}x${h}`).toBe(true);
    }
    for (let i = 0; i < named.length; i++) {
      for (let j = i + 1; j < named.length; j++) {
        const [an, a] = named[i]!;
        const [bn, b] = named[j]!;
        expect(overlaps(a, b), `${an} vs ${bn}`).toBe(false);
      }
    }
  });

  it.each(VIEWPORTS)('%ix%i: Corp is above the Runner, hand at the bottom', (w, h) => {
    const l = computeLayout(w, h);
    expect(l.corp.row.y + l.corp.row.height).toBeLessThanOrEqual(l.center.y);
    expect(l.center.y + l.center.height).toBeLessThanOrEqual(l.runner.row.y);
    expect(l.runner.row.y + l.runner.row.height).toBeLessThanOrEqual(l.handArea.y);
  });

  it.each(VIEWPORTS)('%ix%i: tap targets are at least 44px', (w, h) => {
    const l = computeLayout(w, h);
    for (const b of [l.runner.deck, l.runner.credits, l.runner.clicks]) {
      expect(b.width).toBeGreaterThanOrEqual(MIN_TOUCH);
      expect(b.height).toBeGreaterThanOrEqual(MIN_TOUCH);
    }
  });

  it('zoomed card is larger than a hand card and fits on screen', () => {
    for (const [w, h] of VIEWPORTS) {
      const l = computeLayout(w, h);
      expect(l.zoom.width).toBeGreaterThan(l.card.width * 2.5);
      expect(inside(l.zoom, w, h)).toBe(true);
    }
  });
});

describe('handSlots', () => {
  it.each(VIEWPORTS)('%ix%i: up to 15 cards stay inside the hand area, each with a 44px visible strip', (w, h) => {
    const l = computeLayout(w, h);
    for (let n = 1; n <= 15; n++) {
      const slots = handSlots(l, n);
      expect(slots).toHaveLength(n);
      for (const s of slots) {
        expect(s.x).toBeGreaterThanOrEqual(l.handArea.x - 0.001);
        expect(s.y).toBeGreaterThanOrEqual(l.handArea.y - 0.001);
        expect(s.x + s.width).toBeLessThanOrEqual(l.handArea.x + l.handArea.width + 0.001);
        expect(s.y + s.height).toBeLessThanOrEqual(l.handArea.y + l.handArea.height + 0.001);
      }
      // Cards in the same row keep >= MIN_TOUCH px of horizontal spacing.
      for (let i = 1; i < slots.length; i++) {
        const a = slots[i - 1]!;
        const b = slots[i]!;
        if (a.y === b.y) expect(b.x - a.x).toBeGreaterThanOrEqual(MIN_TOUCH - 0.001);
      }
    }
  });

  it('5 cards on the reference phone do not overlap at all', () => {
    const slots = handSlots(computeLayout(390, 844), 5);
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i]!.x).toBeGreaterThanOrEqual(slots[i - 1]!.x + slots[i - 1]!.width);
    }
  });
});

describe('handSlots wrapping', () => {
  it('fits 5 per row with no overlap on the reference phone, wrapping 6-10 into two rows', () => {
    const l = computeLayout(390, 844);
    expect(new Set(handSlots(l, 5).map((s) => s.y)).size).toBe(1);
    for (let n = 6; n <= 10; n++) {
      const slots = handSlots(l, n);
      expect(new Set(slots.map((s) => s.y)).size).toBe(2);
      for (let i = 1; i < n; i++) {
        const a = slots[i - 1]!;
        const b = slots[i]!;
        if (a.y === b.y) expect(b.x).toBeGreaterThanOrEqual(a.x + a.width);
      }
    }
  });
});
