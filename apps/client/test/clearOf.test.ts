import { describe, expect, it } from 'vitest';
import { clearOf } from '../src/geometry';
import type { Box } from '../src/hook-types';

const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('clearOf (S-10-6, QA-S9-4)', () => {
  it('a slot clear of every box is unchanged', () => {
    const slot = { x: 0, y: 0, width: 100, height: 50 };
    expect(clearOf(slot, [{ x: 200, y: 0, width: 10, height: 10 }], 4)).toEqual(slot);
  });

  it('desktop case: the wide toast slot stops left of End turn (QA: toast x 431-849, End turn x 824-949)', () => {
    const slot = { x: 431, y: 300, width: 418, height: 110 };
    const endTurn = { x: 824, y: 330, width: 125, height: 52 };
    const r = clearOf(slot, [endTurn], 6);
    expect(r).toEqual({ x: 431, y: 300, width: 824 - 6 - 431, height: 110 });
    expect(overlaps(r, endTurn)).toBe(false);
  });

  it('several boxes in the way: clear of all, some room kept', () => {
    const slot = { x: 0, y: 0, width: 400, height: 100 };
    const boxes = [
      { x: 10, y: 0, width: 30, height: 20 },
      { x: 380, y: 50, width: 40, height: 40 },
    ];
    const r = clearOf(slot, boxes, 2);
    for (const b of boxes) expect(overlaps(r, b)).toBe(false);
    expect(r.width * r.height).toBeGreaterThan(0);
  });
});
