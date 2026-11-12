import { describe, expect, it } from 'vitest';
import { apply, newGame, viewEvents, viewFor, type GameEvent } from '../src/index';
import { discard, draw, endTurn, finishTurn, run, withHand } from './helpers';

describe('viewFor (S-01-4 AC2: opponent hand count, not contents)', () => {
  it('shows the viewer their own hand and hides the opponent hand (count only)', () => {
    const g = newGame(21);
    const rv = viewFor('runner', g);
    expect(rv.viewer).toBe('runner');
    expect(rv.players.runner.hand).toEqual(g.players.runner.hand);
    expect(rv.players.corp.hand).toBeNull();
    expect(rv.players.corp.handCount).toBe(6);

    const cv = viewFor('corp', g);
    expect(cv.players.corp.hand).toEqual(g.players.corp.hand);
    expect(cv.players.runner.hand).toBeNull();
    expect(cv.players.runner.handCount).toBe(5);
  });

  it('never exposes deck order, only counts; no Corp card id leaks to the Runner', () => {
    const g = newGame(21);
    const v = viewFor('runner', g);
    expect(v.players.runner.deckCount).toBe(10);
    expect(v.players.corp.deckCount).toBe(9);
    const json = JSON.stringify(v);
    expect(json).not.toContain('"deck"');
    expect(json).not.toMatch(/"c\d\d"/);
  });

  it('includes turn, active player, phase, counters, result and the viewer legal actions', () => {
    const g = newGame(1);
    const v = viewFor('corp', g);
    expect(v).toMatchObject({ turn: 1, activePlayer: 'corp', phase: 'action', pendingDiscard: 0, result: null });
    expect(v.players.corp.clicks).toBe(3);
    expect(v.players.corp.credits).toBe(5);
    expect(v.players.runner.clicks).toBe(0);
    expect(v.legalActions.map((a) => a.type)).toEqual(['draw', 'gain_credit', 'end_turn']);
    expect(viewFor('runner', g).legalActions).toEqual([]);
  });

  it('Runner discards are face up to both; Corp discards (Archives) are face down to the Runner', () => {
    let s = run(withHand(newGame(7), 'corp', ['c01', 'c02', 'c03', 'c04', 'c05', 'c06']), [
      endTurn('corp'),
      discard('corp', [2]),
    ]).state;
    s = run(withHand(s, 'runner', ['r01', 'r02', 'r03', 'r04', 'r05', 'r06', 'r07']), [
      endTurn('runner'),
      discard('runner', [0, 6]),
    ]).state;

    const cv = viewFor('corp', s);
    expect(cv.players.corp).toMatchObject({ discardCount: 1, discard: ['c03'] });
    expect(cv.players.runner).toMatchObject({ discardCount: 2, discard: ['r01', 'r07'] });

    const rv = viewFor('runner', s);
    expect(rv.players.corp).toMatchObject({ discardCount: 1, discard: [null] });
    expect(rv.players.runner).toMatchObject({ discardCount: 2, discard: ['r01', 'r07'] });
    expect(JSON.stringify(rv)).not.toContain('"c03"');
  });

  it('result is shown to both players once the game is over', () => {
    const over = { ...newGame(1), phase: 'over' as const, result: { winner: 'runner' as const, reason: 'corp_decked' as const } };
    for (const p of ['corp', 'runner'] as const) {
      expect(viewFor(p, over)).toMatchObject({ phase: 'over', result: { winner: 'runner', reason: 'corp_decked' }, legalActions: [] });
    }
  });

  it('returned arrays are copies (mutating a view cannot change state)', () => {
    const g = run(withHand(newGame(1), 'corp', ['c01', 'c02', 'c03', 'c04', 'c05', 'c06']), [endTurn('corp'), discard('corp', [0])]).state;
    const v = viewFor('corp', g);
    (v.players.corp.hand as string[]).push('hacked');
    (v.players.corp.discard as (string | null)[]).push('hacked');
    expect(g.players.corp.hand).toHaveLength(5);
    expect(g.players.corp.discard).toEqual([{ cardId: 'c01', faceUp: false }]);
  });
});

describe('viewEvents', () => {
  it('hides cardId of opponent draws (click draw and the Corp free draw) and keeps your own', () => {
    const { events } = apply(newGame(1), draw('corp'));
    expect(viewEvents('corp', events)).toEqual(events);
    expect(viewEvents('runner', events)).toEqual([{ type: 'card_drawn', player: 'corp' }]);

    const runnerTurn = finishTurn(newGame(1)).state;
    const free = apply(runnerTurn, endTurn('runner')).events;
    const projected = viewEvents('runner', free);
    expect(projected.at(-1)).toEqual({ type: 'card_drawn', player: 'corp' });
    expect(viewEvents('corp', free)).toEqual(free);
  });

  it('Corp discard: Runner sees only the count; Corp sees indices and ids', () => {
    const s = run(withHand(newGame(1), 'corp', ['c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07']), [endTurn('corp')]).state;
    const { events } = apply(s, discard('corp', [6, 2]));
    const own = events[0];
    expect(own).toEqual({ type: 'cards_discarded', player: 'corp', count: 2, handIndices: [2, 6], cardIds: ['c03', 'c07'] });
    expect(viewEvents('corp', events)[0]).toEqual(own);
    expect(viewEvents('runner', events)[0]).toEqual({ type: 'cards_discarded', player: 'corp', count: 2 });
  });

  it('Runner discard: Corp sees count and card ids (face up) but not hand indices', () => {
    let s = finishTurn(newGame(1)).state;
    s = run(withHand(s, 'runner', ['r01', 'r02', 'r03', 'r04', 'r05', 'r06']), [endTurn('runner')]).state;
    const { events } = apply(s, discard('runner', [4]));
    expect(viewEvents('runner', events)[0]).toEqual({
      type: 'cards_discarded',
      player: 'runner',
      count: 1,
      handIndices: [4],
      cardIds: ['r05'],
    });
    expect(viewEvents('corp', events)[0]).toEqual({ type: 'cards_discarded', player: 'runner', count: 1, cardIds: ['r05'] });
  });

  it('turn, credit, discard_required, game_over and rejection events pass through unchanged', () => {
    const evs: GameEvent[] = [
      { type: 'credit_gained', player: 'corp', amount: 1 },
      { type: 'discard_required', player: 'corp', count: 2 },
      { type: 'turn_ended', player: 'corp' },
      { type: 'turn_started', player: 'runner', turn: 2, clicks: 4 },
      { type: 'game_over', winner: 'runner', reason: 'corp_decked' },
      { type: 'action_rejected', reason: 'no_clicks' },
    ];
    expect(viewEvents('runner', evs)).toEqual(evs);
    expect(viewEvents('corp', evs)).toEqual(evs);
  });
});
