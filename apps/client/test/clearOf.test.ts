import { describe, expect, it } from 'vitest';
import { clearOf, freeRect } from '../src/geometry';
import { collapseRepeats } from '../src/hints';
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

describe('collapseRepeats (S-10-6: toasts stay short enough to read)', () => {
  it('identical lines in a row become one with a count; others stay', () => {
    expect(collapseRepeats('PAD Campaign: +1 credit\nPAD Campaign: +1 credit\nPAD Campaign: +1 credit')).toBe('PAD Campaign: +1 credit ×3');
    expect(collapseRepeats('A\nB\nA')).toBe('A\nB\nA');
    expect(collapseRepeats('Not enough credits')).toBe('Not enough credits');
    expect(collapseRepeats(collapseRepeats('X\nX'))).toBe('X ×2');
  });
});

describe('freeRect (QA-S10-1: a toast over the table only where nothing is drawn)', () => {
  const region = { x: 0, y: 0, width: 300, height: 100 };
  it('the whole region when nothing is in it', () => {
    expect(freeRect(region, [], 10, 10)).toEqual(region);
  });
  it('the biggest free part, clear of every box (with the gap)', () => {
    const boxes = [
      { x: 0, y: 0, width: 120, height: 100 },
      { x: 200, y: 0, width: 100, height: 40 },
    ];
    const r = freeRect(region, boxes, 10, 10, 2)!;
    for (const b of boxes) expect(overlaps(r, b)).toBe(false);
    expect(r).toEqual({ x: 122, y: 42, width: 178, height: 58 });
  });
  it('null when nothing big enough is free', () => {
    expect(freeRect(region, [{ x: 0, y: 0, width: 295, height: 100 }], 10, 10)).toBeNull();
  });
});
