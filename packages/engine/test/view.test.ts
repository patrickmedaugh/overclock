import { describe, expect, it } from 'vitest';
import { apply, newGame, viewEvents, viewFor } from '../src/index';

describe('viewFor', () => {
  it('shows the viewer their own hand and hides the opponent hand', () => {
    const g = newGame(21);
    const rv = viewFor('runner', g);
    expect(rv.viewer).toBe('runner');
    expect(rv.players.runner.hand).toEqual(g.players.runner.hand);
    expect(rv.players.corp.hand).toBeNull();
    expect(rv.players.corp.handCount).toBe(5);

    const cv = viewFor('corp', g);
    expect(cv.players.corp.hand).toEqual(g.players.corp.hand);
    expect(cv.players.runner.hand).toBeNull();
  });

  it('never exposes deck order, only counts', () => {
    const g = newGame(21);
    const v = viewFor('runner', g);
    expect(v.players.runner.deckCount).toBe(10);
    expect(v.players.corp.deckCount).toBe(10);
    expect(JSON.stringify(v)).not.toContain('"deck"');
    for (const id of g.players.corp.hand) {
      // Corp-only ids (c..) must not leak into the Runner's view.
      expect(JSON.stringify(v)).not.toContain(`"${id}"`);
    }
  });

  it('includes counters and the viewer legal actions', () => {
    const v = viewFor('runner', newGame(1));
    expect(v.players.runner.clicks).toBe(4);
    expect(v.players.runner.credits).toBe(5);
    expect(v.activePlayer).toBe('runner');
    expect(v.legalActions).toEqual([{ type: 'draw', player: 'runner' }]);
    expect(viewFor('corp', newGame(1)).legalActions).toEqual([]);
  });

  it('returned hand arrays are copies (mutating a view cannot change state)', () => {
    const g = newGame(1);
    const v = viewFor('runner', g);
    (v.players.runner.hand as string[]).push('hacked');
    expect(g.players.runner.hand).toHaveLength(5);
  });
});

describe('viewEvents', () => {
  it('hides cardId of opponent draws and keeps it for your own', () => {
    const { events } = apply(newGame(1), { type: 'draw', player: 'runner' });
    expect(viewEvents('runner', events)).toEqual(events);
    expect(viewEvents('corp', events)).toEqual([{ type: 'card_drawn', player: 'runner' }]);
  });
});
