// S-12-6: Melange Mining Corp.'s "Click, click, click:" is drawn as the click symbol "×3".
import { ALL_CARDS, getCard } from '@overclock/cards';
import { describe, expect, it } from 'vitest';
import { clickCostOf } from '../src/cardText';

describe('clickCostOf (S-12-6)', () => {
  it('reads Melange Mining Corp. as 3 clicks, then the rest of its text', () => {
    const melange = getCard('c15')!;
    expect(melange.name).toBe('Melange Mining Corp.');
    expect(clickCostOf(melange.text)).toEqual({ count: 3, rest: 'Gain 7 credits.' });
  });

  it('keeps a single "Click:" and text without a click cost as words', () => {
    expect(clickCostOf('Click: Gain 2 credits.')).toBeNull();
    expect(clickCostOf('Gain 2 clicks.')).toBeNull();
    expect(clickCostOf('If the Runner is tagged, Private Security Force gains: "Click: Do 1 meat damage."')).toBeNull();
  });

  it('counts two clicks and keeps later paragraphs', () => {
    expect(clickCostOf('Click, click: Draw 3 cards.\nLimit 1 per turn.')).toEqual({ count: 2, rest: 'Draw 3 cards.\nLimit 1 per turn.' });
  });

  it('only Melange among the cards has a multi-click cost in its text (so no other face changes)', () => {
    const hits = ALL_CARDS.filter((c) => clickCostOf(c.text) !== null).map((c) => c.id);
    expect(hits).toEqual(['c15']);
  });
});
