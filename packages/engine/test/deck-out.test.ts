import { describe, expect, it } from 'vitest';
import { apply, legalActions, newGame, replay, viewFor, type Action, type GameState } from '../src/index';
import { discard, draw, endTurn, finishTurn, gainCredit, run } from './helpers';

/** Plays real turns (Corp click-draws whenever it can) until the Runner's turn with an empty Corp deck. */
function playToEmptyCorpDeck(seed: number): { state: GameState; actions: Action[] } {
  let s = newGame(seed);
  const actions: Action[] = [];
  const doRun = (as: Action[]) => {
    s = run(s, as).state;
    actions.push(...as);
  };
  for (let guard = 0; guard < 100; guard++) {
    if (s.activePlayer === 'corp') {
      while (s.players.corp.clicks > 0 && s.players.corp.deck.length > 0) doRun([draw('corp')]);
    } else if (s.players.corp.deck.length === 0) {
      return { state: s, actions };
    }
    const p = s.activePlayer;
    doRun([endTurn(p)]);
    if (s.phase === 'discard') {
      const n = s.players[p].hand.length - 5;
      doRun([discard(p, Array.from({ length: n }, (_, i) => i))]);
    }
  }
  throw new Error('did not reach an empty Corp deck');
}

describe('S-01-1 AC5: the Corp loses when its mandatory draw finds an empty deck', () => {
  const { state: before, actions } = playToEmptyCorpDeck(123);

  it('setup sanity: Runner turn, Corp deck empty, game still running', () => {
    expect(before.activePlayer).toBe('runner');
    expect(before.players.corp.deck).toEqual([]);
    expect(before.phase).toBe('action');
    expect(before.result).toBeNull();
  });

  it('Runner end_turn -> turn_ended, turn_started(corp), game_over(runner, corp_decked)', () => {
    const { state, events } = apply(before, endTurn('runner'));
    expect(events).toEqual([
      { type: 'turn_ended', player: 'runner' },
      { type: 'turn_started', player: 'corp', turn: before.turn + 1, clicks: 3 },
      { type: 'game_over', winner: 'runner', reason: 'corp_decked' },
    ]);
    expect(state.phase).toBe('over');
    expect(state.result).toEqual({ winner: 'runner', reason: 'corp_decked' });
    expect(viewFor('corp', state).result).toEqual({ winner: 'runner', reason: 'corp_decked' });
    expect(viewFor('runner', state).phase).toBe('over');
  });

  it('after the game is over, every action from either side is rejected with game_over', () => {
    const over = apply(before, endTurn('runner')).state;
    const all: Action[] = [];
    for (const p of ['corp', 'runner'] as const) {
      all.push(draw(p), gainCredit(p), endTurn(p), discard(p, [0]));
    }
    for (const a of all) {
      const r = apply(over, a);
      expect(r.events).toEqual([{ type: 'action_rejected', reason: 'game_over' }]);
      expect(r.state).toBe(over);
    }
    expect(legalActions(over, 'corp')).toEqual([]);
    expect(legalActions(over, 'runner')).toEqual([]);
  });

  it('a click-draw from an empty deck is only rejected (deck_empty), it does not lose the game', () => {
    // The Corp's last regular turn: drawing on an empty deck is refused, nothing else happens.
    const corpTurn = { ...before, activePlayer: 'corp' as const, players: { ...before.players, corp: { ...before.players.corp, clicks: 3 } } };
    const r = apply(corpTurn, draw('corp'));
    expect(r.events).toEqual([{ type: 'action_rejected', reason: 'deck_empty' }]);
    expect(r.state.phase).toBe('action');
  });

  it('replay-based regression: (seed, actions) reaches the same game over', () => {
    const r = replay(123, [...actions, endTurn('runner')]);
    expect(r.state.result).toEqual({ winner: 'runner', reason: 'corp_decked' });
    expect(r.events.at(-1)).toEqual({ type: 'game_over', winner: 'runner', reason: 'corp_decked' });
  });

  it('also reachable without click-draws (only mandatory draws): finishTurn loop ends the game', () => {
    let s = newGame(5);
    let turns = 0;
    while (s.phase !== 'over' && turns < 100) {
      s = finishTurn(s).state;
      turns++;
    }
    expect(s.result).toEqual({ winner: 'runner', reason: 'corp_decked' });
    // 9 cards left after turn 1 -> 9 more Corp draws, the 10th Corp turn start loses.
    expect(s.turn).toBe(21);
  });
});
