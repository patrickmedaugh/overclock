// QA-S3-1: accessed cards (Archives late in a game) wrap into rows instead of shrinking one row.
import { describe, expect, it } from 'vitest';
import type { Box } from '../src/hook-types';
import { accessSlots, computeLayout } from '../src/layout';

const inside = (b: Box, r: Box) => b.x >= r.x - 0.5 && b.y >= r.y - 0.5 && b.x + b.width <= r.x + r.width + 0.5 && b.y + b.height <= r.y + r.height + 0.5;
const overlaps = (a: Box, b: Box) => a.x + 0.5 < b.x + b.width && b.x + 0.5 < a.x + a.width && a.y + 0.5 < b.y + b.height && b.y + 0.5 < a.y + a.height;

describe('accessSlots', () => {
  for (const [w, h] of [[844, 390], [640, 360], [1280, 800]] as const) {
    const area = computeLayout(w, h, {}, { viewer: 'runner' }).access;
    it(`${w}x${h}: 1-17 cards fit inside, never overlap (tag room included), and stay at least 44px wide`, () => {
      const tagH = 16;
      for (let n = 1; n <= 17; n++) {
        const slots = accessSlots(area, n, tagH, 6);
        expect(slots).toHaveLength(n);
        for (const s of slots) {
          expect(inside({ ...s, height: s.height + tagH }, area), `${n} cards: ${JSON.stringify(s)}`).toBe(true);
          expect(s.width, `${n} cards`).toBeGreaterThanOrEqual(44);
        }
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(overlaps({ ...slots[i]!, height: slots[i]!.height + tagH }, slots[j]!)).toBe(false);
      }
    });
  }

  it('one card stays big (one row); twelve wrap into rows bigger than one row of twelve', () => {
    const area = computeLayout(640, 360, {}, { viewer: 'runner' }).access;
    expect(accessSlots(area, 1, 16, 6)[0]!.width).toBeGreaterThanOrEqual(120);
    const twelve = accessSlots(area, 12, 16, 6);
    expect(new Set(twelve.map((b) => b.y)).size).toBeGreaterThan(1);
    expect(twelve[0]!.width).toBeGreaterThanOrEqual(60);
  });
});
