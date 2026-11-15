// Sprint 8 E5 (S-08-3): Viktor 1.0 and Heimdall 1.0, brain damage, maximum hand size.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, viewEvents, viewFor, type Action, type GameEvent, type GameState } from '../src/index';
import { act, board, rejection, run, withPlayer, type BoardSpec } from './helpers';
import { expectRunnerEventsClean, expectRunnerViewClean } from './hidden';

const CORE = { deckSet: 'core' } as const;
const types = (events: readonly GameEvent[]) => events.map((e) => e.type);
const runHq: Action = { type: 'run', player: 'runner', server: 'hq' };
const pass: Action = { type: 'pass', player: 'runner' };

/** Runner turn on the core decks; HQ protected by face-up `ice` (uid after the rig's). */
function atIce(ice: string, spec: Omit<BoardSpec, 'servers'> = {}): GameState {
  return act(board({ ...spec, servers: { hq: { ice: [`+${ice}`] } } }, 77, CORE), runHq).state;
}

describe('S-08-3 AC1: Viktor 1.0 — 1 brain damage, then the run ends', () => {
  it('letting it fire: a random Grip card to the Heap, max hand size 5 → 4, run ended; the order of events', () => {
    const s = atIce('c17', { runnerHand: ['r01', 'r03', 'r14'] });
    expect(s.run?.step).toBe('encounter');
    expect(viewFor('runner', s).run?.letFire).toEqual({
      iceCardId: 'c17',
      outcomes: [
        { sub: 0, op: 'brain_damage', amount: 1 },
        { sub: 1, op: 'end_run', amount: 0 },
      ],
      ends: 'run',
    });
    const r = act(s, pass);
    const lost = r.state.players.runner.discard.map((d) => d.cardId);
    expect(lost).toHaveLength(1);
    expect(r.events).toEqual([
      { type: 'subroutine_fired', iceUid: 'i1', sub: 0 },
      { type: 'brain_damage', amount: 1, cardIds: lost, maxHandSize: 4 },
      { type: 'subroutine_resolved', iceUid: 'i1', cardId: 'c17', outcome: { sub: 0, op: 'brain_damage', amount: 1 } },
      { type: 'subroutine_fired', iceUid: 'i1', sub: 1 },
      { type: 'subroutine_resolved', iceUid: 'i1', cardId: 'c17', outcome: { sub: 1, op: 'end_run', amount: 0 } },
      { type: 'run_ended', server: 'hq', outcome: 'ended_by_ice' },
    ]);
    expect(r.state.players.runner.hand).toHaveLength(2);
    expect(r.state.players.runner.brainDamage).toBe(1);
    for (const viewer of ['corp', 'runner'] as const) {
      const v = viewFor(viewer, r.state);
      expect(v.players.runner.maxHandSize).toBe(4);
      expect(v.players.runner.brainDamage).toBe(1);
      expect(v.players.runner.discard).toEqual(lost);
    }
    expect(viewEvents('corp', r.events)).toEqual(r.events);
    expectRunnerEventsClean(r.events, 'Viktor', r.state);
    expectRunnerViewClean(r.state, 'Viktor');
  });

  it('the lost card comes from the seeded RNG: the same state always loses the same card', () => {
    const s = atIce('c17', { runnerHand: ['r01', 'r03', 'r14', 'r04', 'r05'] });
    expect(act(s, pass).state.players.runner.discard).toEqual(act(s, pass).state.players.runner.discard);
  });

  it('Gordian Blade breaks both subroutines (code gate), nothing happens', () => {
    const s = atIce('c17', { rig: ['r05'], runnerCredits: 5 });
    const pump: Action = { type: 'use_ability', player: 'runner', uid: 'i1', ability: 1 };
    const brk = (sub: number): Action => ({ type: 'use_ability', player: 'runner', uid: 'i1', ability: 0, sub });
    const r = run(s, [pump, brk(0), brk(1)]);
    expect(types(r.events)).toContain('ice_passed');
    expect(r.state.players.runner.brainDamage).toBe(0);
  });
});

describe('S-08-3 AC2: after brain damage the Runner discards down to his lower maximum', () => {
  it('max 4: ending the turn with 6 cards asks for 2; discard accepts exactly 2', () => {
    let s = act(atIce('c17', { runnerHand: ['r01', 'r03', 'r14', 'r04', 'r05', 'r07', 'r08'] }), pass).state;
    expect(s.players.runner.hand).toHaveLength(6);
    const ended = act(s, { type: 'end_turn', player: 'runner' });
    expect(ended.events).toEqual([{ type: 'discard_required', player: 'runner', count: 2 }]);
    s = ended.state;
    expect(viewFor('runner', s).pendingDiscard).toBe(2);
    expect(rejection(apply(s, { type: 'discard', player: 'runner', handIndices: [0] }).events)).toBe('bad_discard');
    expect(legalActions(s, 'runner')).toEqual([{ type: 'discard', player: 'runner', handIndices: [4, 5] }]);
    const done = act(s, { type: 'discard', player: 'runner', handIndices: [0, 1] });
    expect(done.state.players.runner.hand).toHaveLength(4);
    expect(done.state.activePlayer).toBe('corp');
  });

  it('with 4 cards and max 4 there is no discard step', () => {
    const s = act(atIce('c17', { runnerHand: ['r01', 'r03', 'r14', 'r04', 'r05'] }), pass).state;
    expect(s.players.runner.hand).toHaveLength(4);
    expect(types(act(s, { type: 'end_turn', player: 'runner' }).events)).toEqual(['turn_ended', 'turn_started', 'card_drawn']);
  });

  it("brain damage adds up (4 + 1 = max 0) and never touches the Corp's limit", () => {
    const s = withPlayer(atIce('c17', { runnerHand: ['r01', 'r03'] }), 'runner', { brainDamage: 4 });
    const out = act(s, pass);
    expect(out.events).toContainEqual(expect.objectContaining({ type: 'brain_damage', amount: 1, maxHandSize: 0 }));
    expect(out.state.players.runner.brainDamage).toBe(5);
    expect(viewFor('corp', out.state).players.runner.maxHandSize).toBe(0);
    expect(viewFor('corp', out.state).players.corp.maxHandSize).toBe(5);
  });
});

describe('S-08-3 AC3: Heimdall 1.0 (strength 6) and Corroder (strength 2)', () => {
  const spec = { rig: ['r04'] };
  const pump: Action = { type: 'use_ability', player: 'runner', uid: 'i1', ability: 1 };
  const brk = (sub: number): Action => ({ type: 'use_ability', player: 'runner', uid: 'i1', ability: 0, sub });

  it('breaking needs +4 strength first: break options say too_weak until 4 pumps; all three cost 4 + 3 = 7', () => {
    let s = atIce('c18', { ...spec, runnerCredits: 7 });
    const v = viewFor('runner', s).run!;
    expect(v.ice).toMatchObject({ cardId: 'c18', strength: 6 });
    expect(v.ice!.subroutines.map((x) => x.text)).toEqual(['Do 1 brain damage', 'End the run', 'End the run']);
    expect(v.options.filter((o) => o.action.type === 'use_ability' && o.action.ability === 0).map((o) => o.reject)).toEqual(['too_weak', 'too_weak', 'too_weak']);
    expect(v.options.find((o) => o.action.type === 'use_ability' && o.action.ability === 1)).toMatchObject({ cost: 1, reject: null });
    s = run(s, [pump, pump, pump, pump]).state;
    expect(viewFor('runner', s).run!.breakerStrength['i1']).toBe(6);
    expect(viewFor('runner', s).run!.options.filter((o) => o.action.type === 'use_ability' && o.action.ability === 0).map((o) => o.reject)).toEqual([null, null, null]);
    const r = run(s, [brk(0), brk(1), brk(2)]);
    expect(types(r.events)).toContain('ice_passed');
    expect(r.state.players.runner.credits).toBe(0);
  });

  it('with 6 credits the third break is no_credits', () => {
    const s = run(atIce('c18', { ...spec, runnerCredits: 6 }), [pump, pump, pump, pump, brk(0), brk(1)]).state;
    expect(rejection(apply(s, brk(2)).events)).toBe('no_credits');
  });

  it('letting it fire: 1 brain damage, then the first End the run ends it (the third never fires)', () => {
    const r = act(atIce('c18', { runnerHand: ['r01', 'r03'] }), pass);
    expect(types(r.events)).toEqual(['subroutine_fired', 'brain_damage', 'subroutine_resolved', 'subroutine_fired', 'subroutine_resolved', 'run_ended']);
    expect(r.state.players.runner.brainDamage).toBe(1);
  });
});

describe('S-08-3 AC4: brain damage with an empty Grip flatlines the Runner', () => {
  it('Viktor with no cards: brain_damage{cardIds: []}, subroutine_resolved, run_ended{flatline}, game_over{corp, flatline}', () => {
    const s = atIce('c17', { runnerHand: [] });
    expect(viewFor('runner', s).run?.letFire?.ends).toBe('game');
    const r = act(s, pass);
    expect(r.events).toEqual([
      { type: 'subroutine_fired', iceUid: 'i1', sub: 0 },
      { type: 'brain_damage', amount: 1, cardIds: [], maxHandSize: 4 },
      { type: 'subroutine_resolved', iceUid: 'i1', cardId: 'c17', outcome: { sub: 0, op: 'brain_damage', amount: 1 } },
      { type: 'run_ended', server: 'hq', outcome: 'flatline' },
      { type: 'game_over', winner: 'corp', reason: 'flatline' },
    ]);
    expect(r.state.result).toEqual({ winner: 'corp', reason: 'flatline' });
    expect(legalActions(r.state, 'runner')).toEqual([]);
  });
});

describe('S-08-3 AC5: a hand limit below 0 at the end of the Runner turn flatlines him', () => {
  it('max −1: end_turn → game_over{corp, flatline}, no discard step', () => {
    const s = withPlayer(board({ runnerHand: [] }, 77, CORE), 'runner', { brainDamage: 6 });
    expect(viewFor('runner', s).players.runner.maxHandSize).toBe(-1);
    const r = act(s, { type: 'end_turn', player: 'runner' });
    expect(r.events).toEqual([{ type: 'game_over', winner: 'corp', reason: 'flatline' }]);
    expect(r.state.phase).toBe('over');
  });

  it('max 0 is not a flatline: the Runner discards everything and the turn passes', () => {
    const s = withPlayer(board({ runnerHand: ['r01', 'r03'] }, 77, CORE), 'runner', { brainDamage: 5 });
    const r = run(s, [{ type: 'end_turn', player: 'runner' }, { type: 'discard', player: 'runner', handIndices: [0, 1] }]);
    expect(r.state.activePlayer).toBe('corp');
    expect(r.state.players.runner.hand).toEqual([]);
  });
});
