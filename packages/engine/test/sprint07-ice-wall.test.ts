// Sprint 7 E6 (S-07-5): Ice Wall can be advanced (face up or down) and has +1 strength per
// counter; other ICE can't be advanced. Real play from a new game (hands/credits set first).
import { describe, expect, it } from 'vitest';
import { apply, legalActions, viewEvents, viewFor, type Action, type GameState } from '../src/index';
import { finishTurn, rejection, run, withHand, withPlayer, newGame } from './helpers';

const advance = (uid: string): Action => ({ type: 'advance', player: 'corp', uid });
const newServer = (handIndex = 0): Action => ({ type: 'install', player: 'corp', handIndex, server: 'new' });
const breakSub = (uid: string): Action => ({ type: 'use_ability', player: 'runner', uid, ability: 0, sub: 0 });
const pump = (uid: string): Action => ({ type: 'use_ability', player: 'runner', uid, ability: 1 });

function corpTurn(hand: string[], actions: Action[], credits = 5): GameState {
  return run(withPlayer(withHand(newGame(21), 'corp', hand), 'corp', { credits }), actions).state;
}

describe('S-07-5 AC1: Advance · 1 credit on Ice Wall', () => {
  it('face down: offered like an agenda; uses 1 click and 1 credit; both players see the counter', () => {
    const s = corpTurn(['c05'], [newServer()]);
    expect(viewFor('corp', s).installedOptions).toEqual({ i1: [{ action: advance('i1'), cost: 1, reject: null }] });
    expect(legalActions(s, 'corp')).toContainEqual(advance('i1'));
    const r = apply(s, advance('i1'));
    expect(r.events).toEqual([
      { type: 'credits_spent', player: 'corp', amount: 1 },
      { type: 'card_advanced', uid: 'i1', advancements: 1 },
    ]);
    expect(r.state.players.corp).toMatchObject({ clicks: s.players.corp.clicks - 1, credits: s.players.corp.credits - 1 });
    expect(viewEvents('runner', r.events)).toEqual(r.events);
    const runnerSees = viewFor('runner', r.state).corpServers.find((sv) => sv.id === 'remote1')!.ice[0];
    expect(runnerSees).toEqual({ uid: 'i1', cardId: null, faceUp: false, advancements: 1, hostedCredits: 0 });
    expect(viewFor('corp', r.state).corpServers.find((sv) => sv.id === 'remote1')!.ice[0]!.advancements).toBe(1);
  });

  it('face up too (rezzed during a run); never score', () => {
    let s = corpTurn(['c05'], [newServer()]);
    s = finishTurn(s).state;
    s = run(s, [{ type: 'run', player: 'runner', server: 'remote1' }, { type: 'rez', player: 'corp', uid: 'i1' }, { type: 'pass', player: 'runner' }]).state;
    s = finishTurn(s).state; // Corp turn 3
    expect(s.servers.find((sv) => sv.id === 'remote1')!.ice[0]!.rezzed).toBe(true);
    expect(viewFor('corp', s).installedOptions.i1).toEqual([{ action: advance('i1'), cost: 1, reject: null }]);
    const r = run(s, [advance('i1')]);
    expect(r.events.at(-1)).toEqual({ type: 'card_advanced', uid: 'i1', advancements: 1 });
    expect(rejection(apply(r.state, { type: 'score', player: 'corp', uid: 'i1' }).events)).toBe('bad_target');
  });

  it('the usual reasons: no_credits, no_clicks, not_your_turn (listed off-turn)', () => {
    const broke = corpTurn(['c05'], [newServer()], 0);
    expect(viewFor('corp', broke).installedOptions.i1).toEqual([{ action: advance('i1'), cost: 1, reject: 'no_credits' }]);
    const tired = run(corpTurn(['c05'], [newServer()]), [advance('i1'), advance('i1')]).state;
    expect(rejection(apply(tired, advance('i1')).events)).toBe('no_clicks');
    const off = finishTurn(tired).state;
    expect(viewFor('corp', off).installedOptions.i1).toEqual([{ action: advance('i1'), cost: 1, reject: 'not_your_turn' }]);
    expect(viewFor('runner', off).installedOptions).toEqual({});
  });
});

describe('S-07-5 AC2: an advanced Ice Wall is stronger', () => {
  it('2 counters: strength 3 (1 + 2); Corroder (2) is too weak until it pays +1 strength', () => {
    let s = corpTurn(['c05'], [newServer(), advance('i1'), advance('i1')]);
    s = withPlayer(withHand(finishTurn(s).state, 'runner', ['r04']), 'runner', { credits: 5 });
    s = run(s, [
      { type: 'install', player: 'runner', handIndex: 0 },
      { type: 'run', player: 'runner', server: 'remote1' },
      { type: 'rez', player: 'corp', uid: 'i1' },
    ]).state;
    for (const side of ['corp', 'runner'] as const) {
      expect(viewFor(side, s).run).toMatchObject({ step: 'encounter', ice: { cardId: 'c05', strength: 3 } });
      expect(viewFor(side, s).run!.breakerStrength).toEqual({ i2: 2 });
    }
    const opts = viewFor('runner', s).run!.options;
    expect(opts).toContainEqual({ action: breakSub('i2'), cost: 1, reject: 'too_weak' });
    expect(rejection(apply(s, breakSub('i2')).events)).toBe('too_weak');
    const pumped = apply(s, pump('i2'));
    expect(pumped.events).toEqual([
      { type: 'credits_spent', player: 'runner', amount: 1 },
      { type: 'strength_changed', uid: 'i2', strength: 3 },
    ]);
    const broken = apply(pumped.state, breakSub('i2'));
    expect(broken.events).toContainEqual({ type: 'subroutine_broken', iceUid: 'i1', sub: 0, breakerUid: 'i2' });
    expect(broken.state.run?.step).toBe('continue');
  });

  it('no counters: printed strength 1', () => {
    let s = corpTurn(['c05'], [newServer()]);
    s = run(finishTurn(s).state, [{ type: 'run', player: 'runner', server: 'remote1' }, { type: 'rez', player: 'corp', uid: 'i1' }]).state;
    expect(viewFor('runner', s).run!.ice!.strength).toBe(1);
  });
});

describe('S-07-5 AC3: other ICE has no Advance button', () => {
  it.each([
    ['Wall of Static', 'c04'],
    ['Enigma', 'c06'],
    ['Neural Katana', 'c07'],
  ])('%s: not listed; advance is bad_target', (_name, id) => {
    const s = corpTurn([id], [newServer()]);
    expect(viewFor('corp', s).installedOptions).toEqual({});
    expect(rejection(apply(s, advance('i1')).events)).toBe('bad_target');
  });
});
