// Sprint 7 E3 (S-07-2): the Corp rezzes assets/upgrades on its own turn (no click); PAD Campaign's
// credit when the Corp's turn begins; Akitaro Watanabe's ICE rez discount (option price, the
// hot-seat rez window and the payment). Reached by real play from a new game (hands/credits set first).
import { describe, expect, it } from 'vitest';
import {
  apply,
  legalActions,
  newGame,
  viewEvents,
  viewFor,
  type Action,
  type GameState,
  type ServerId,
} from '../src/index';
import { finishTurn, rejection, run, withHand, withPlayer } from './helpers';

const install = (handIndex: number, server: ServerId | 'new'): Action => ({ type: 'install', player: 'corp', handIndex, server });
const rez = (uid: string, player: 'corp' | 'runner' = 'corp'): Action => ({ type: 'rez', player, uid });
const runOn = (server: ServerId): Action => ({ type: 'run', player: 'runner', server });
const pass = (player: 'corp' | 'runner'): Action => ({ type: 'pass', player });

/** Corp turn 1 (seed 21) with `hand` and `credits`, after `actions`. */
function corpTurn(hand: string[], actions: Action[], credits = 5): GameState {
  return run(withPlayer(withHand(newGame(21), 'corp', hand), 'corp', { credits }), actions).state;
}

describe('S-07-2 AC1/AC2: Rez on the Corp turn, no click', () => {
  it('PAD Campaign: Rez · 2 credits; takes 2 credits and no click; face up on both boards', () => {
    const s = corpTurn(['c03'], [install(0, 'new')]);
    const v = viewFor('corp', s);
    expect(v.installedOptions.i1).toEqual([{ action: rez('i1'), cost: 2, reject: null }]);
    expect(legalActions(s, 'corp')).toContainEqual(rez('i1'));
    expect(s.players.corp).toMatchObject({ clicks: 2, credits: 5 });
    const r = apply(s, rez('i1'));
    expect(r.events).toEqual([
      { type: 'credits_spent', player: 'corp', amount: 2 },
      { type: 'card_rezzed', uid: 'i1', cardId: 'c03', server: 'remote1' },
    ]);
    expect(r.state.players.corp).toMatchObject({ clicks: 2, credits: 3 });
    for (const side of ['corp', 'runner'] as const) {
      expect(viewFor(side, r.state).corpServers.find((sv) => sv.id === 'remote1')!.content[0]).toMatchObject({
        uid: 'i1',
        cardId: 'c03',
        faceUp: true,
      });
      expect(viewEvents(side, r.events)).toEqual(r.events); // public
    }
    // Rezzed: no more Rez button.
    expect(viewFor('corp', r.state).installedOptions.i1).toBeUndefined();
    expect(rejection(apply(r.state, rez('i1')).events)).toBe('bad_target');
  });

  it('Akitaro Watanabe: Rez · 1 credit; works in a central server too; 0 clicks left is fine', () => {
    let s = corpTurn(['c11', 'c11'], [install(0, 'new'), install(0, 'hq')]);
    s = withPlayer(s, 'corp', { clicks: 0 });
    expect(viewFor('corp', s).installedOptions).toEqual({
      i1: [{ action: rez('i1'), cost: 1, reject: null }],
      i2: [{ action: rez('i2'), cost: 1, reject: null }],
    });
    const r = run(s, [rez('i2')]);
    expect(r.events.at(-1)).toEqual({ type: 'card_rezzed', uid: 'i2', cardId: 'c11', server: 'hq' });
  });

  it('AC2: fewer credits than the rez cost: offered with no_credits; apply refuses, nothing changes', () => {
    const s = corpTurn(['c03'], [install(0, 'new')], 1);
    expect(viewFor('corp', s).installedOptions.i1).toEqual([{ action: rez('i1'), cost: 2, reject: 'no_credits' }]);
    expect(legalActions(s, 'corp')).not.toContainEqual(rez('i1'));
    const r = apply(s, rez('i1'));
    expect(rejection(r.events)).toBe('no_credits');
    expect(r.state).toBe(s);
  });

  it('only on the Corp turn outside a run: off-turn not_your_turn (listed); during a run wrong_phase; the Runner never sees options', () => {
    const s = corpTurn(['c03', 'c04'], [install(0, 'new'), install(0, 'remote1')]);
    const off = finishTurn(s).state;
    expect(viewFor('corp', off).installedOptions.i1).toEqual([{ action: rez('i1'), cost: 2, reject: 'not_your_turn' }]);
    expect(rejection(apply(off, rez('i1')).events)).toBe('not_your_turn');
    expect(viewFor('runner', off).installedOptions).toEqual({});
    expect(rejection(apply(off, rez('i1', 'runner')).events)).toBe('bad_target');
    // The Runner approaches the ICE in front of PAD: the Corp may rez the ICE, not the asset.
    const approach = run(off, [runOn('remote1')]).state;
    expect(approach.run?.step).toBe('approach');
    expect(rejection(apply(approach, rez('i1')).events)).toBe('wrong_phase');
    expect(viewFor('corp', approach).installedOptions.i1).toEqual([{ action: rez('i1'), cost: 2, reject: 'wrong_phase' }]);
    // ICE can't be rezzed in the action phase.
    expect(rejection(apply(s, rez('i2')).events)).toBe('bad_target');
  });

  it('rejection order: invalid_action, game_over', () => {
    const s = corpTurn(['c03'], [install(0, 'new')]);
    expect(rejection(apply(s, { type: 'rez', player: 'corp', uid: 5 } as unknown as Action).events)).toBe('invalid_action');
    expect(rejection(apply({ ...s, phase: 'over' }, rez('i1')).events)).toBe('game_over');
  });
});

describe('S-07-2 AC3: PAD Campaign gives 1 credit when the Corp turn begins', () => {
  it('face up: turn_started, ability_triggered, credit_gained 1, then the draw; both see it', () => {
    let s = corpTurn(['c03'], [install(0, 'new'), rez('i1')]);
    s = finishTurn(s).state; // Runner's turn: nothing for PAD
    const credits = s.players.corp.credits;
    const ended = run(s, [{ type: 'end_turn', player: 'runner' }]);
    const start = ended.events.slice(ended.events.findIndex((e) => e.type === 'turn_started'));
    expect(start).toEqual([
      { type: 'turn_started', player: 'corp', turn: 3, clicks: 3 },
      { type: 'ability_triggered', uid: 'i1', cardId: 'c03', trigger: 'turn_start' },
      { type: 'credit_gained', player: 'corp', amount: 1 },
      { type: 'card_drawn', player: 'corp', cardId: s.players.corp.deck[0] },
    ]);
    expect(ended.state.players.corp.credits).toBe(credits + 1);
    expect(viewEvents('runner', ended.events)).toContainEqual({ type: 'ability_triggered', uid: 'i1', cardId: 'c03', trigger: 'turn_start' });
    // Every Corp turn, not the Runner's.
    const runnerTurn = finishTurn(ended.state);
    expect(runnerTurn.events.some((e) => e.type === 'ability_triggered')).toBe(false);
  });

  it('face down: nothing', () => {
    const back = finishTurn(finishTurn(corpTurn(['c03'], [install(0, 'new')])).state);
    expect(back.events.map((e) => e.type)).toEqual(['turn_ended', 'turn_started', 'card_drawn']);
  });
});

describe('S-07-2 AC4/AC5: Akitaro Watanabe lowers the rez cost of ICE in its server by 2', () => {
  it('Wall of Static costs 1 and Ice Wall 0 in its server; the Corp pays the lowered price', () => {
    // remote1: Akitaro (rezzed), Wall of Static (inner), Ice Wall (outer; 1 credit to install as 2nd ICE).
    let s = corpTurn(['c11', 'c04', 'c05'], [install(0, 'new'), install(0, 'remote1'), install(0, 'remote1'), rez('i1')]);
    expect(s.players.corp.credits).toBe(5 - 1 - 1);
    s = finishTurn(s).state;
    s = run(s, [runOn('remote1')]).state;
    expect(viewFor('corp', s).run!.options[0]).toEqual({ action: rez('i3'), cost: 0, reject: null }); // Ice Wall 1 - 2 -> 0
    s = run(s, [pass('corp'), pass('runner')]).state; // don't rez Ice Wall; continue
    expect(viewFor('corp', s).run!.options[0]).toEqual({ action: rez('i2'), cost: 1, reject: null }); // Wall of Static 3 - 2
    const r = apply(s, rez('i2'));
    expect(r.events.slice(0, 2)).toEqual([
      { type: 'credits_spent', player: 'corp', amount: 1 },
      { type: 'ice_rezzed', uid: 'i2', cardId: 'c04' },
    ]);
    expect(r.state.players.corp.credits).toBe(2);
  });

  it('Ice Wall at 0: rezzing spends nothing (no credits_spent event)', () => {
    let s = corpTurn(['c11', 'c05'], [install(0, 'new'), install(0, 'remote1'), rez('i1')]);
    s = run(finishTurn(s).state, [runOn('remote1')]).state;
    const r = apply(s, rez('i2'));
    expect(r.events[0]).toEqual({ type: 'ice_rezzed', uid: 'i2', cardId: 'c05' });
  });

  it('ICE on another server pays full price; a face-down Akitaro gives nothing', () => {
    let s = corpTurn(['c11', 'c04', 'c11'], [install(0, 'new'), install(0, 'hq'), install(0, 'hq')]);
    s = run(s, [rez('i1')]).state; // Akitaro in remote1 face up, the one in HQ face down
    s = run(finishTurn(s).state, [runOn('hq')]).state;
    expect(viewFor('corp', s).run!.options[0]).toEqual({ action: rez('i2'), cost: 3, reject: null });
  });

  it('AC5 (pass-the-phone): Corp at 1 credit, Akitaro face up: the Corp is asked about Wall of Static in its server', () => {
    let s = corpTurn(['c11', 'c04'], [install(0, 'new'), install(0, 'remote1'), rez('i1')], 2);
    expect(s.players.corp.credits).toBe(1);
    expect(s.options.rezWindow).toBe('affordable');
    s = run(finishTurn(s).state, [runOn('remote1')]).state;
    expect(s.run).toMatchObject({ step: 'approach' });
    expect(viewFor('runner', s).run!.waitingOn).toBe('corp');
    expect(viewFor('corp', s).run!.options).toEqual([
      { action: rez('i2'), cost: 1, reject: null },
      { action: pass('corp'), cost: 0, reject: null },
    ]);
  });

  it('AC5 contrast: the same Corp at 1 credit is not asked about Wall of Static elsewhere (passed face down at once)', () => {
    let s = corpTurn(['c11', 'c04'], [install(0, 'new'), install(0, 'hq'), rez('i1')], 2);
    const r = run(finishTurn(s).state, [runOn('hq')]);
    s = r.state;
    expect(r.events.map((e) => e.type)).toContain('ice_passed');
    expect(s.run).toMatchObject({ step: 'continue' });
  });
});
