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

  it('sets up both sides: 5-card hands from shuffled 15-card decks, 5 credits', () => {
    const g = newGame(99);
    for (const [side, list] of [
      ['corp', CORP_STARTER_DECK],
      ['runner', RUNNER_STARTER_DECK],
    ] as const) {
      const p = g.players[side];
      expect(p.hand).toHaveLength(5);
      expect(p.deck).toHaveLength(10);
      expect(p.credits).toBe(5);
      expect([...p.hand, ...p.deck].sort()).toEqual([...list].sort());
    }
  });

  it('Sprint 0 starts on the Runner turn with 4 clicks', () => {
    const g = newGame(1);
    expect(g.activePlayer).toBe('runner');
    expect(g.players.runner.clicks).toBe(4);
    expect(g.players.corp.clicks).toBe(0);
  });

  it('state is plain JSON (round-trips through JSON)', () => {
    const g = newGame(7);
    expect(clone(g)).toEqual(g);
    expect(Object.getPrototypeOf(g)).toBe(Object.prototype);
  });
});
