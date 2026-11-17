// Sprint 10 (S-10-3): Bank Job's amount control: the trace bid control's layout with a
// Back, and its words. Every limit comes from the engine's offered `activate` amounts.
import type { CardOption } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { bidLayout, computeLayout } from '../src/layout';
import { amountCaption, amountKey, amountOption, offeredAmounts, takeButtonLabel } from '../src/traceText';
import { scoredPileText } from '../src/terms';

const take = (n: number, uid = 'bj'): CardOption => ({ action: { type: 'activate', player: 'runner', uid, ability: 0, amount: n }, cost: 0, gain: n, reject: null });
const pass: CardOption = { action: { type: 'pass', player: 'runner' }, cost: 0, reject: null };

describe('S-10-3 amount helpers', () => {
  const options = [take(1), take(2), take(3), take(8), pass];
  it('the offered amounts are the engine\'s options for that ability, lowest first', () => {
    expect(amountKey(take(3))).toBe('bj:0');
    expect(amountKey(pass)).toBeNull();
    expect(amountKey({ action: { type: 'activate', player: 'runner', uid: 'a', ability: 0 }, cost: 0, reject: null })).toBeNull();
    expect(offeredAmounts([take(8), take(1), take(8), take(2, 'other')], 'bj:0')).toEqual([1, 8]);
    expect(amountOption(options, 'bj:0', 3)).toBe(options[2]);
    expect(amountOption(options, 'bj:0', 5)).toBeNull();
  });
  it('words: "Take 3", "5 stay"', () => {
    expect(takeButtonLabel(3)).toBe('Take 3');
    expect(amountCaption([1, 2, 3, 4, 5, 6, 7, 8], 3)).toBe('5 stay');
    expect(amountCaption([1, 2, 3, 4, 5, 6, 7, 8], 8)).toBe('0 stay');
  });
  it('S-10-1 pile words: "2 agendas · 3 points", "1 agenda · 1 point"', () => {
    expect(scoredPileText(2, 3)).toBe('2 agendas · 3 points');
    expect(scoredPileText(1, 1)).toBe('1 agenda · 1 point');
  });
});

describe('S-10-3 amount control layout: Back, −, the number, +, Max and Take are all >= 44 px, in order, inside the strip', () => {
  it.each([
    [844, 390],
    [640, 360],
    [891, 296],
    [1280, 800],
  ])('%ix%i', (w, h) => {
    for (const viewer of ['corp', 'runner'] as const) {
      const l = computeLayout(w, h, {}, { viewer });
      const area = l.runButtons;
      const b = bidLayout(area, l.scale, true);
      const all = [b.back!, b.dec, b.tile, b.inc, b.max, b.go];
      for (const x of all) expect(Math.min(x.width, x.height)).toBeGreaterThanOrEqual(44);
      for (let i = 1; i < all.length; i++) expect(all[i]!.x).toBeGreaterThanOrEqual(all[i - 1]!.x + all[i - 1]!.width);
      for (const x of all) {
        expect(x.x).toBeGreaterThanOrEqual(area.x - 0.5);
        expect(x.x + x.width).toBeLessThanOrEqual(area.x + area.width + 0.5);
        expect(x.y).toBeGreaterThanOrEqual(area.y - 0.5);
        expect(x.y + x.height).toBeLessThanOrEqual(area.y + area.height + 0.5);
      }
    }
  });
  it('without Back it is the Sprint 9 bid control, unchanged', () => {
    const area = { x: 4, y: 284, width: 520, height: 72 };
    const b = bidLayout(area, 0.92);
    expect(b.back).toBeNull();
    expect(bidLayout(area, 0.92, false)).toEqual(b);
  });
});
