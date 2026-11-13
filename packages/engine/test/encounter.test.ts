// Sprint 3 E4: encounters — subroutines (End the run, lose a click, net damage +
// flatline) and icebreakers (break, strength, too_weak, no_credits, wrong type,
// all broken -> passed, Gordian Blade's run-long strength). S-03-3 AC4/AC5, S-03-4.
import { describe, expect, it } from 'vitest';
import {
  apply,
  legalActions,
  viewEvents,
  viewFor,
  type Action,
  type GameState,
  type RejectReason,
  type ServerId,
} from '../src/index';
import { act, board, clone, liveness, rejection, type BoardSpec } from './helpers';

const runOn = (server: ServerId): Action => ({ type: 'run', player: 'runner', server });
const letThrough: Action = { type: 'pass', player: 'runner' };
const cont: Action = { type: 'pass', player: 'runner' };
const use = (uid: string, ability: number, sub?: number): Action =>
  sub === undefined ? { type: 'use_ability', player: 'runner', uid, ability } : { type: 'use_ability', player: 'runner', uid, ability, sub };

function expectRejected(state: GameState, action: Action, reason: RejectReason): void {
  const snapshot = clone(state);
  const r = apply(state, action);
  expect(r.events).toEqual([{ type: 'action_rejected', reason }]);
  expect(r.state).toBe(state);
  expect(state).toEqual(snapshot);
  if (reason !== 'invalid_action') expect(legalActions(state, action.player)).not.toContainEqual(action);
}

/** A run on HQ already at the encounter with its (rezzed) outermost ICE. */
function encounterOn(spec: BoardSpec): GameState {
  const s = act(board(spec), runOn('hq')).state;
  expect(s.run?.step).toBe('encounter');
  return s;
}

function playAll(state: GameState, actions: Action[]) {
  let s = state;
  const events = [];
  for (const a of actions) {
    const r = act(s, a);
    s = r.state;
    events.push(...r.events);
    liveness(s);
  }
  return { state: s, events };
}

describe('S-03-3 AC4/AC5: unbroken subroutines fire in order on Let it through', () => {
  it('Enigma: the Runner loses 1 click, then End the run', () => {
    const s = encounterOn({ servers: { hq: { ice: ['+c06'] } }, runnerClicks: 4 });
    expect(s.players.runner.clicks).toBe(3);
    const r = act(s, letThrough);
    expect(r.events).toEqual([
      { type: 'subroutine_fired', iceUid: 'i1', sub: 0 },
      { type: 'clicks_lost', player: 'runner', amount: 1 },
      { type: 'subroutine_resolved', iceUid: 'i1', cardId: 'c06', outcome: { sub: 0, op: 'lose_clicks', amount: 1 } },
      { type: 'subroutine_fired', iceUid: 'i1', sub: 1 },
      { type: 'subroutine_resolved', iceUid: 'i1', cardId: 'c06', outcome: { sub: 1, op: 'end_run', amount: 0 } },
      { type: 'run_ended', server: 'hq', outcome: 'ended_by_ice' },
    ]);
    expect(r.state.players.runner.clicks).toBe(2);
    expect(r.state.phase).toBe('action');
  });

  it('"loses 1 click, if able": with no click left nothing is lost (no clicks_lost event)', () => {
    const s = encounterOn({ servers: { hq: { ice: ['+c06'] } }, runnerClicks: 1 });
    expect(s.players.runner.clicks).toBe(0);
    const r = act(s, letThrough);
    expect(r.events.map((e) => e.type)).toEqual(['subroutine_fired', 'subroutine_resolved', 'subroutine_fired', 'subroutine_resolved', 'run_ended']);
    expect(r.events[1]).toEqual({ type: 'subroutine_resolved', iceUid: 'i1', cardId: 'c06', outcome: { sub: 0, op: 'lose_clicks', amount: 0 } });
    expect(r.state.players.runner.clicks).toBe(0);
  });

  it('Neural Katana: 3 net damage discards 3 random Grip cards face up to the Heap (seeded)', () => {
    const hand = ['r01', 'r02', 'r03', 'r09', 'r12'];
    const s = encounterOn({ servers: { hq: { ice: ['+c07'] } }, runnerHand: hand });
    const r = act(s, letThrough);
    const dmg = r.events.find((e) => e.type === 'net_damage');
    expect(dmg).toMatchObject({ type: 'net_damage', amount: 3 });
    const gone = (dmg as { cardIds: readonly string[] }).cardIds;
    expect(gone).toHaveLength(3);
    expect(r.state.players.runner.hand).toHaveLength(2);
    expect([...r.state.players.runner.hand, ...gone].sort()).toEqual([...hand].sort());
    expect(r.state.players.runner.discard).toEqual(gone.map((cardId) => ({ cardId, faceUp: true })));
    // Public: both projections keep the card ids (face up to the Heap).
    expect(viewEvents('corp', r.events)).toContainEqual(dmg);
    // Katana has no End the run: the ICE is passed and the run goes on.
    expect(r.events.at(-1)).toEqual({ type: 'ice_passed', uid: 'i1' });
    expect(r.state.run!.step).toBe('continue');
    // Deterministic from the state (seeded RNG in state).
    expect(act(clone(s), letThrough).events).toEqual(r.events);
  });

  it('net damage equal to the Grip discards it all, no flatline', () => {
    const r = act(encounterOn({ servers: { hq: { ice: ['+c07'] } }, runnerHand: ['r01', 'r02', 'r03'] }), letThrough);
    expect(r.state.players.runner.hand).toEqual([]);
    expect(r.state.phase).toBe('run');
  });

  it('AC5: more net damage than cards in the Grip: the Corp wins at once (flatline)', () => {
    const r = act(encounterOn({ servers: { hq: { ice: ['+c07'] } }, runnerHand: ['r01', 'r02'] }), letThrough);
    expect(r.events.slice(1)).toEqual([
      { type: 'net_damage', amount: 3, cardIds: ['r01', 'r02'] },
      { type: 'subroutine_resolved', iceUid: 'i1', cardId: 'c07', outcome: { sub: 0, op: 'net_damage', amount: 3 } },
      { type: 'run_ended', server: 'hq', outcome: 'flatline' },
      { type: 'game_over', winner: 'corp', reason: 'flatline' },
    ]);
    expect(r.state).toMatchObject({ phase: 'over', result: { winner: 'corp', reason: 'flatline' }, run: null });
    expect(r.state.players.runner.discard.map((d) => d.cardId)).toEqual(['r01', 'r02']);
    liveness(r.state);
  });
});

describe('S-03-4: icebreakers', () => {
  // i1 Corroder, i2 Gordian Blade, i3 Ninja; HQ ICE i4.
  const rig = ['r04', 'r05', 'r06'];

  it('AC1/AC2: matching breaker lights its buttons with prices; too weak breaks are offered dimmed (too_weak)', () => {
    const s = encounterOn({ rig, servers: { hq: { ice: ['+c04'] } } }); // Wall of Static, strength 3
    const v = viewFor('runner', s).run!;
    expect(v.breakerStrength).toEqual({ i1: 2, i2: 2, i3: 0 });
    expect(v.options).toEqual([
      { action: use('i1', 0, 0), cost: 1, reject: 'too_weak' },
      { action: use('i1', 1), cost: 1, reject: null },
      { action: letThrough, cost: 0, reject: null },
    ]);
    expectRejected(s, use('i1', 0, 0), 'too_weak');
    // The Corp sees the encounter but has nothing to decide.
    expect(viewFor('corp', s).run!.options).toEqual([]);
  });

  it('AC2/AC3: Corroder on Wall of Static = 2 credits (1 to raise, 1 to break); all broken -> passed', () => {
    const s = encounterOn({ rig, servers: { hq: { ice: ['+c04'] } }, runnerCredits: 5 });
    const pump = act(s, use('i1', 1));
    expect(pump.events).toEqual([
      { type: 'credits_spent', player: 'runner', amount: 1 },
      { type: 'strength_changed', uid: 'i1', strength: 3 },
    ]);
    expect(viewFor('runner', pump.state).run!.options[0]).toEqual({ action: use('i1', 0, 0), cost: 1, reject: null });
    const brk = act(pump.state, use('i1', 0, 0));
    expect(brk.events).toEqual([
      { type: 'credits_spent', player: 'runner', amount: 1 },
      { type: 'subroutine_broken', iceUid: 'i4', sub: 0, breakerUid: 'i1' },
      { type: 'strength_changed', uid: 'i1', strength: 2 },
      { type: 'ice_passed', uid: 'i4' },
    ]);
    expect(brk.state.players.runner.credits).toBe(3);
    expect(brk.state.run!.step).toBe('continue');
    // The broken subroutine shows crossed out while the ICE is current.
    expect(viewFor('runner', brk.state).run!.ice!.subroutines).toEqual([{ text: 'End the run', broken: true }]);
    // Continue: into HQ.
    expect(act(brk.state, cont).events[0]).toEqual({ type: 'run_successful', server: 'hq' });
  });

  it('AC3: a broken subroutine does not fire; Let it through fires only the rest (Enigma)', () => {
    const s = encounterOn({ rig, servers: { hq: { ice: ['+c06'] } } }); // Enigma strength 2, Gordian 2
    const v = viewFor('runner', s).run!;
    expect(v.options).toEqual([
      { action: use('i2', 0, 0), cost: 1, reject: null },
      { action: use('i2', 0, 1), cost: 1, reject: null },
      { action: use('i2', 1), cost: 1, reject: null },
      { action: letThrough, cost: 0, reject: null },
    ]);
    const broken = act(s, use('i2', 0, 1)); // break End the run
    expect(viewFor('runner', broken.state).run!.ice!.subroutines).toEqual([
      { text: 'The Runner loses 1 click, if able', broken: false },
      { text: 'End the run', broken: true },
    ]);
    expectRejected(broken.state, use('i2', 0, 1), 'bad_target'); // already broken
    const r = act(broken.state, letThrough);
    expect(r.events).toEqual([
      { type: 'subroutine_fired', iceUid: 'i4', sub: 0 },
      { type: 'clicks_lost', player: 'runner', amount: 1 },
      { type: 'subroutine_resolved', iceUid: 'i4', cardId: 'c06', outcome: { sub: 0, op: 'lose_clicks', amount: 1 } },
      { type: 'ice_passed', uid: 'i4' },
    ]);
    expect(r.state.run!.step).toBe('continue');
  });

  it('Ninja on Neural Katana: +5 strength for 3 credits, break for 1; strength drops back after the encounter', () => {
    const s = encounterOn({ rig, servers: { hq: { ice: ['+c07'] } }, runnerCredits: 4 });
    expect(viewFor('runner', s).run!.options.map((o) => [o.action, o.cost, o.reject])).toEqual([
      [use('i3', 0, 0), 1, 'too_weak'],
      [use('i3', 1), 3, null],
      [letThrough, 0, null],
    ]);
    const r = playAll(s, [use('i3', 1), use('i3', 0, 0)]);
    expect(r.state.players.runner.credits).toBe(0);
    expect(r.events).toContainEqual({ type: 'strength_changed', uid: 'i3', strength: 5 });
    expect(r.events).toContainEqual({ type: 'strength_changed', uid: 'i3', strength: 0 });
    expect(viewFor('runner', r.state).run!.breakerStrength.i3).toBe(0);
  });

  it('AC4: a breaker of the wrong kind or no breaker: no break buttons, only Let it through', () => {
    const s = encounterOn({ rig: ['r05'], servers: { hq: { ice: ['+c04'] } } }); // Gordian vs barrier
    expect(viewFor('runner', s).run!.options).toEqual([{ action: letThrough, cost: 0, reject: null }]);
    expectRejected(s, use('i1', 0, 0), 'bad_target');
    expectRejected(s, use('i1', 1), 'bad_target'); // no pumping a wrong-type breaker either
    const none = encounterOn({ servers: { hq: { ice: ['+c05'] } } });
    expect(viewFor('runner', none).run!.options).toEqual([{ action: letThrough, cost: 0, reject: null }]);
    expect(viewFor('runner', none).run!.breakerStrength).toEqual({});
  });

  it('AC5: cannot afford: offered with no_credits; apply refuses and nothing changes; too_weak comes first', () => {
    const s = encounterOn({ rig, servers: { hq: { ice: ['+c04'] } }, runnerCredits: 0 });
    expect(viewFor('runner', s).run!.options.map((o) => o.reject)).toEqual(['too_weak', 'no_credits', null]);
    expectRejected(s, use('i1', 1), 'no_credits');
    expectRejected(s, use('i1', 0, 0), 'too_weak'); // paying would not help: too_weak before no_credits
    const strong = encounterOn({ rig, servers: { hq: { ice: ['+c05'] } }, runnerCredits: 0 }); // Ice Wall str 1
    expectRejected(strong, use('i1', 0, 0), 'no_credits');
  });

  it('AC6: Gordian Blade keeps raised strength for the rest of the run; Corroder/Ninja drop back after each ICE', () => {
    // HQ: i3 Enigma (inner), i4 Enigma (outer), both rezzed. Gordian i1, Corroder i2 (unused).
    let s = encounterOn({ rig: ['r05', 'r04'], servers: { hq: { ice: ['+c06', '+c06'] } }, runnerCredits: 10 });
    s = playAll(s, [use('i1', 1)]).state; // Gordian 3
    s = playAll(s, [use('i1', 0, 0), use('i1', 0, 1)]).state; // both broken -> passed
    expect(s.run!.step).toBe('continue');
    expect(viewFor('runner', s).run!.breakerStrength.i1).toBe(3);
    s = playAll(s, [cont]).state; // second Enigma, rezzed: encounter
    expect(s.run).toMatchObject({ step: 'encounter', position: 0 });
    expect(viewFor('runner', s).run!.breakerStrength.i1).toBe(3); // still raised
    // At the end of the run it drops back.
    const end = playAll(s, [use('i1', 0, 0), use('i1', 0, 1), cont, cont]); // into HQ, then Done
    expect(end.events.slice(-2)).toEqual([
      { type: 'strength_changed', uid: 'i1', strength: 2 },
      { type: 'run_ended', server: 'hq', outcome: 'accessed' },
    ]);
    expect(end.events.filter((e) => e.type === 'strength_changed')).toHaveLength(1); // no drop between the two ICE

    // Corroder: two Walls of Static; raised strength is gone at the second one.
    let c = encounterOn({ rig: ['r04'], servers: { hq: { ice: ['+c04', '+c04'] } }, runnerCredits: 10 });
    c = playAll(c, [use('i1', 1), use('i1', 0, 0), cont]).state;
    expect(c.run).toMatchObject({ step: 'encounter', position: 0 });
    expect(viewFor('runner', c).run!.breakerStrength.i1).toBe(2);
    expect(viewFor('runner', c).run!.options[0]!.reject).toBe('too_weak');

    // Ninja: two Neural Katanas; +5 is gone at the second one.
    let n = encounterOn({ rig: ['r06'], servers: { hq: { ice: ['+c07', '+c07'] } }, runnerCredits: 10 });
    n = playAll(n, [use('i1', 1), use('i1', 0, 0), cont]).state;
    expect(viewFor('runner', n).run!.breakerStrength.i1).toBe(0);
  });

  it('Gordian Blade raised during the run drops back when the run ends by jack out too', () => {
    let s = encounterOn({ rig: ['r05'], servers: { hq: { ice: ['+c06'] } }, runnerCredits: 5 });
    s = playAll(s, [use('i1', 1), use('i1', 0, 0), use('i1', 0, 1)]).state;
    const r = act(s, { type: 'jack_out', player: 'runner' });
    expect(r.events).toEqual([
      { type: 'strength_changed', uid: 'i1', strength: 2 },
      { type: 'run_ended', server: 'hq', outcome: 'jacked_out' },
    ]);
  });

  const enc = () => encounterOn({ rig, servers: { hq: { ice: ['+c05'] } } }); // Ice Wall i4
  const cases: [string, RejectReason, () => { state: GameState; action: Action }][] = [
    ['ability not an integer', 'invalid_action', () => ({ state: enc(), action: { type: 'use_ability', player: 'runner', uid: 'i1', ability: 'x' } as unknown as Action })],
    ['sub not an integer', 'invalid_action', () => ({ state: enc(), action: { type: 'use_ability', player: 'runner', uid: 'i1', ability: 0, sub: 0.5 } as unknown as Action })],
    ['game over', 'game_over', () => ({ state: { ...enc(), phase: 'over', result: { winner: 'corp', reason: 'flatline' } }, action: use('i1', 0, 0) })],
    ['the Corp', 'not_your_turn', () => ({ state: enc(), action: { type: 'use_ability', player: 'corp', uid: 'i1', ability: 0, sub: 0 } })],
    ['at continue', 'wrong_phase', () => ({ state: act(enc(), use('i1', 0, 0)).state, action: use('i1', 1) })],
    ['outside a run', 'wrong_phase', () => ({ state: board({ rig }), action: use('i1', 1) })],
    ['unknown breaker', 'bad_target', () => ({ state: enc(), action: use('i9', 0, 0) })],
    ['an ICE uid', 'bad_target', () => ({ state: enc(), action: use('i4', 0, 0) })],
    ['ability out of range', 'bad_target', () => ({ state: enc(), action: use('i1', 2) })],
    ['break without sub', 'bad_target', () => ({ state: enc(), action: use('i1', 0) })],
    ['sub out of range', 'bad_target', () => ({ state: enc(), action: use('i1', 0, 1) })],
    ['pump with a sub', 'bad_target', () => ({ state: enc(), action: use('i1', 1, 0) })],
  ];
  it.each(cases)('use_ability rejects (%s): %s', (_name, reason, make) => {
    const { state, action } = make();
    expectRejected(state, action, reason);
  });

  it('every offered option agrees with apply at every encounter', () => {
    for (const ice of ['+c04', '+c05', '+c06', '+c07']) {
      for (const credits of [0, 1, 5]) {
        const s = encounterOn({ rig, servers: { hq: { ice: [ice] } }, runnerCredits: credits });
        for (const o of viewFor('runner', s).run!.options) expect(rejection(apply(s, o.action).events)).toBe(o.reject);
      }
    }
  });
});
