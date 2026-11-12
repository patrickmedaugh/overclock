import { CORP_STARTER_DECK, RUNNER_STARTER_DECK } from '@overclock/cards';
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/index';
import { clone } from './helpers';

describe('newGame (S-00-5 AC1: same seed deals the same cards)', () => {
  it('two games with the same seed are identical, including hands and deck order', () => {
    const a = newGame(12345);
    const b = newGame(12345);
    expect(a).toEqual(b);
    expect(a.players.runner.hand).toEqual(b.players.runner.hand);
    expect(a.players.corp.hand).toEqual(b.players.corp.hand);
  });

  it('different seeds give different deals', () => {
    const deals = new Set(
      [1, 2, 3, 4, 5].map((seed) => JSON.stringify(newGame(seed).players.runner.hand)),
    );
    expect(deals.size).toBeGreaterThan(1);
  });

  it('sets up both sides from shuffled 15-card decks with 5 credits (Corp has taken its free draw)', () => {
    const g = newGame(99);
    for (const [side, list, handSize] of [
      ['corp', CORP_STARTER_DECK, 6],
      ['runner', RUNNER_STARTER_DECK, 5],
    ] as const) {
      const p = g.players[side];
      expect(p.hand).toHaveLength(handSize);
      expect(p.deck).toHaveLength(15 - handSize);
      expect(p.discard).toEqual([]);
      expect(p.credits).toBe(5);
      expect([...p.hand, ...p.deck].sort()).toEqual([...list].sort());
    }
  });


  it('state is plain JSON (round-trips through JSON)', () => {
    const g = newGame(7);
    expect(clone(g)).toEqual(g);
    expect(Object.getPrototypeOf(g)).toBe(Object.prototype);
  });
});
