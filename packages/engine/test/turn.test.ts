import { describe, expect, it } from 'vitest';
import { apply, newGame, type GameEvent } from '../src/index';
import { endTurn, finishTurn, gainCredit, run, withHand } from './helpers';

describe('S-01-1 AC1: a new game starts on the Corp turn', () => {
  it('Corp is active on turn 1 with 3 clicks and has taken its free draw (6 cards)', () => {
    const g = newGame(1);
    expect(g.turn).toBe(1);
    expect(g.activePlayer).toBe('corp');
    expect(g.phase).toBe('action');
    expect(g.result).toBeNull();
    expect(g.players.corp.clicks).toBe(3);
    expect(g.players.corp.hand).toHaveLength(6);
    expect(g.players.corp.deck).toHaveLength(9);
    expect(g.players.runner.clicks).toBe(0);
    expect(g.players.runner.hand).toHaveLength(5);
    expect(g.players.corp.discard).toEqual([]);
    expect(g.players.runner.discard).toEqual([]);
  });

  it('is deterministic per seed', () => {
    expect(newGame(42)).toEqual(newGame(42));
  });
});

describe('S-01-1 AC2: Runner turn starts with 4 clicks and no free card', () => {
  it('Corp end_turn (hand <= 5) -> turn_ended, turn_started(runner, 2, 4); Runner draws nothing', () => {
    const g = withHand(newGame(3), 'corp', ['c01', 'c02', 'c03', 'c04', 'c05']);
    const { state, events } = apply(g, endTurn('corp'));
    expect(events).toEqual([
      { type: 'turn_ended', player: 'corp' },
      { type: 'turn_started', player: 'runner', turn: 2, clicks: 4 },
    ]);
    expect(state.activePlayer).toBe('runner');
    expect(state.turn).toBe(2);
    expect(state.phase).toBe('action');
    expect(state.players.runner.clicks).toBe(4);
    expect(state.players.runner.hand).toEqual(g.players.runner.hand);
    expect(state.players.runner.deck).toEqual(g.players.runner.deck);
  });
});

describe('S-01-1 AC3: Corp turn starts with 3 fresh clicks and the free draw', () => {
  it('Runner end_turn -> turn_ended, turn_started(corp, 3, 3), card_drawn(top of Corp deck)', () => {
    const s1 = finishTurn(newGame(4)).state;
    expect(s1.activePlayer).toBe('runner');
    const top = s1.players.corp.deck[0];
    const { state, events } = apply(s1, endTurn('runner'));
    expect(events).toEqual([
      { type: 'turn_ended', player: 'runner' },
      { type: 'turn_started', player: 'corp', turn: 3, clicks: 3 },
      { type: 'card_drawn', player: 'corp', cardId: top },
    ]);
    expect(state.activePlayer).toBe('corp');
    expect(state.players.corp.clicks).toBe(3);
    expect(state.players.corp.hand).toEqual([...s1.players.corp.hand, top]);
    expect(state.players.corp.deck).toEqual(s1.players.corp.deck.slice(1));
  });

  it('turn counts player-turns and alternates: Corp 1, Runner 2, Corp 3, Runner 4, Corp 5', () => {
    let s = newGame(9);
    const seen: Array<[number, string, number]> = [[s.turn, s.activePlayer, s.players[s.activePlayer].clicks]];
    for (let i = 0; i < 4; i++) {
      s = finishTurn(s).state;
      seen.push([s.turn, s.activePlayer, s.players[s.activePlayer].clicks]);
    }
    expect(seen).toEqual([
      [1, 'corp', 3],
      [2, 'runner', 4],
      [3, 'corp', 3],
      [4, 'runner', 4],
      [5, 'corp', 3],
    ]);
  });

  it('the Corp draws exactly once per Corp turn and the Runner never draws for free', () => {
    let s = newGame(10);
    const drawsBy: Record<string, number> = { corp: 0, runner: 0 };
    for (let i = 0; i < 6; i++) {
      const r = finishTurn(s);
      s = r.state;
      r.events.filter((e): e is Extract<GameEvent, { type: 'card_drawn' }> => e.type === 'card_drawn').forEach((e) => {
        drawsBy[e.player] = (drawsBy[e.player] ?? 0) + 1;
      });
    }
    // Six turn changes: 3 into Runner turns, 3 into Corp turns.
    expect(drawsBy).toEqual({ corp: 3, runner: 0 });
  });
});

describe('S-01-3: ending the turn', () => {
  it('AC2: Corp may end with clicks left; leftover clicks are lost', () => {
    const g = withHand(newGame(5), 'corp', ['c01']);
    expect(g.players.corp.clicks).toBe(3);
    const { state } = apply(g, endTurn('corp'));
    expect(state.players.corp.clicks).toBe(0);
    expect(state.activePlayer).toBe('runner');
  });

  it('AC2: Runner may end with all 4 clicks left', () => {
    const s = finishTurn(newGame(5)).state;
    const { state, events } = apply(s, endTurn('runner'));
    expect(events[0]).toEqual({ type: 'turn_ended', player: 'runner' });
    expect(state.players.runner.clicks).toBe(0);
    expect(state.activePlayer).toBe('corp');
  });

  it('AC3: spending the last click does not end the turn by itself', () => {
    const { state, events } = run(newGame(6), [gainCredit('corp'), gainCredit('corp'), gainCredit('corp')]);
    expect(state.players.corp.clicks).toBe(0);
    expect(state.activePlayer).toBe('corp');
    expect(state.turn).toBe(1);
    expect(state.phase).toBe('action');
    expect(events.map((e) => e.type)).toEqual(['credit_gained', 'credit_gained', 'credit_gained']);
    // End turn is still offered and still works.
    expect(apply(state, endTurn('corp')).events[0]?.type).not.toBe('action_rejected');
  });
});
