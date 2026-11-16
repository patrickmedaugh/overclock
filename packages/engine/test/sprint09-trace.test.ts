// Sprint 9 E3 (S-09-1): traces — the Corp bids first, then the Runner; ties go to the Runner; windows
// where a bid cannot matter are skipped (auto bid 0); Hunter's subroutine in a run.
import { describe, expect, it } from 'vitest';
import { apply, hasMeaningfulResponse, legalActions, viewFor, waitingOn, type Action, type GameEvent, type GameState } from '../src/index';
import { act, board, liveness, rejection, type BoardSpec } from './helpers';
import { expectRunnerEventsClean, expectRunnerViewClean } from './hidden';

const CORE = { deckSet: 'core' } as const;
const types = (events: readonly GameEvent[]) => events.map((e) => e.type);
const runHq: Action = { type: 'run', player: 'runner', server: 'hq' };
const letFire: Action = { type: 'pass', player: 'runner' };
const bid = (player: 'corp' | 'runner', credits: number): Action => ({ type: 'trace_bid', player, credits });

/** The Runner (Kate, link 1 + rig link) encountering a face-up ICE `ice` alone on HQ; its uid comes after the rig's. */
function atIce(ice: string, spec: Omit<BoardSpec, 'servers'> = {}): GameState {
  const s = act(board({ ...spec, servers: { hq: { ice: [`+${ice}`] } } }, 77, CORE), runHq).state;
  expect(s.run?.step).toBe('encounter');
  return s;
}
const iceUid = (spec: Omit<BoardSpec, 'servers'> = {}) => `i${(spec.rig ?? []).length + 1}`;

function clean(r: { state: GameState; events: GameEvent[] }, where: string) {
  expectRunnerEventsClean(r.events, where, r.state);
  expectRunnerViewClean(r.state, where);
  liveness(r.state);
}

describe('S-09-1 AC1/AC2: Hunter fires, the Corp bids first, then the Runner sees what it takes to stop it', () => {
  const spec = { corpCredits: 6, runnerCredits: 5 };

  it('letting Hunter fire opens the Corp’s bid (Trace 3, link 1); the run waits on the Corp', () => {
    const s = atIce('c20', spec);
    // The preview stops where the trace opens (the bids are not known yet).
    expect(viewFor('runner', s).run!.letFire).toEqual({ iceCardId: 'c20', outcomes: [], ends: null });
    const r = act(s, letFire);
    expect(r.events).toEqual([
      { type: 'subroutine_fired', iceUid: iceUid(), sub: 0 },
      { type: 'trace_started', cardId: 'c20', base: 3, link: 1 },
      { type: 'choice_opened', kind: 'trace_corp', player: 'corp', cardId: 'c20' },
    ]);
    expect(r.state.phase).toBe('choice');
    expect(r.state.run).toMatchObject({ step: 'encounter', firing: 0 });
    expect(r.state.choice).toMatchObject({ kind: 'trace_corp', player: 'corp', cardId: 'c20', resume: 'run', trace: { base: 3, strength: null, corpBid: null } });
    expect(waitingOn(r.state)).toBe('corp');
    expect(hasMeaningfulResponse(r.state, 'corp')).toBe(true);
    expect(hasMeaningfulResponse(r.state, 'runner')).toBe(false);
    const trace = { base: 3, strength: 3, corpBid: null, link: 1, runnerMaxBid: 5, corpMaxBid: 6, needed: 2 };
    const cv = viewFor('corp', r.state);
    expect(cv.choice).toMatchObject({ kind: 'trace_corp', waitingOn: 'corp', cardId: 'c20', trace });
    // One bid per amount 0..6, cost = amount.
    expect(cv.choice!.options).toEqual(Array.from({ length: 7 }, (_, credits) => ({ action: bid('corp', credits), cost: credits, reject: null })));
    expect(legalActions(r.state, 'corp')).toEqual(Array.from({ length: 7 }, (_, credits) => bid('corp', credits)));
    // Both see the same public numbers; only the Corp has options.
    expect(viewFor('runner', r.state).choice).toEqual({ kind: 'trace_corp', waitingOn: 'corp', cardId: 'c20', trace, options: [] });
    clean(r, 'Hunter fired');
  });

  it('Corp bids 2 (strength 5): the Runner is asked with "spend 4 to stop it" (needed 4), bids 0..5', () => {
    const s = act(atIce('c20', spec), letFire).state;
    const r = act(s, bid('corp', 2));
    expect(r.events).toEqual([
      { type: 'choice_closed', kind: 'trace_corp', skipped: false },
      { type: 'credits_spent', player: 'corp', amount: 2 },
      { type: 'trace_bid', player: 'corp', credits: 2, total: 5 },
      { type: 'choice_opened', kind: 'trace_runner', player: 'runner', cardId: 'c20' },
    ]);
    expect(r.state.players.corp.credits).toBe(4);
    const rv = viewFor('runner', r.state);
    expect(rv.choice).toMatchObject({ kind: 'trace_runner', waitingOn: 'runner', trace: { base: 3, strength: 5, corpBid: 2, link: 1, runnerMaxBid: 5, corpMaxBid: 4, needed: 4 } });
    expect(rv.choice!.options.map((o) => [o.action, o.cost])).toEqual(Array.from({ length: 6 }, (_, c) => [bid('runner', c), c]));
    expect(hasMeaningfulResponse(r.state, 'runner')).toBe(true);
    expect(hasMeaningfulResponse(r.state, 'corp')).toBe(false);
    clean(r, 'Corp bid');
  });

  it('AC3: Runner bids 4 (5 vs 5): the Runner escaped; both paid; the subroutine reports 0 and Hunter is passed', () => {
    const s = act(act(atIce('c20', spec), letFire).state, bid('corp', 2)).state;
    const r = act(s, bid('runner', 4));
    expect(r.events).toEqual([
      { type: 'choice_closed', kind: 'trace_runner', skipped: false },
      { type: 'credits_spent', player: 'runner', amount: 4 },
      { type: 'trace_bid', player: 'runner', credits: 4, total: 5 },
      { type: 'trace_resolved', cardId: 'c20', strength: 5, total: 5, success: false },
      { type: 'subroutine_resolved', iceUid: iceUid(), cardId: 'c20', outcome: { sub: 0, op: 'trace', amount: 0 } },
      { type: 'ice_passed', uid: iceUid() },
    ]);
    expect(r.state.players.runner).toMatchObject({ credits: 1, tags: 0 });
    expect(r.state.players.corp.credits).toBe(4);
    expect(r.state).toMatchObject({ phase: 'run', choice: null, run: { step: 'continue', firing: null } });
    clean(r, 'escaped');
  });

  it('AC3: Runner bids 2 (5 vs 3): the Runner is tagged (tags_changed), the subroutine reports 1', () => {
    const s = act(act(atIce('c20', spec), letFire).state, bid('corp', 2)).state;
    const r = act(s, bid('runner', 2));
    expect(types(r.events)).toEqual(['choice_closed', 'credits_spent', 'trace_bid', 'trace_resolved', 'tags_changed', 'subroutine_resolved', 'ice_passed']);
    expect(r.events[3]).toEqual({ type: 'trace_resolved', cardId: 'c20', strength: 5, total: 3, success: true });
    expect(r.events[4]).toEqual({ type: 'tags_changed', amount: 1, tags: 1 });
    expect(r.events[5]).toMatchObject({ outcome: { sub: 0, op: 'trace', amount: 1 } });
    expect(r.state.players.runner).toMatchObject({ credits: 3, tags: 1 });
    for (const viewer of ['corp', 'runner'] as const) expect(viewFor(viewer, r.state).players.runner.tags).toBe(1);
    clean(r, 'tagged');
  });
});

describe('S-09-1 AC4: ties go to the Runner (automated check)', () => {
  it('link 2 (Access to Globalsec) + bid 2 = strength 4 (Corp bid 1): the trace fails, no tag', () => {
    const spec = { rig: ['r18'], corpCredits: 5, runnerCredits: 5 };
    let s = act(atIce('c20', spec), letFire).state;
    expect(viewFor('corp', s).choice!.trace).toMatchObject({ link: 2, needed: 1 });
    s = act(s, bid('corp', 1)).state;
    expect(viewFor('runner', s).choice!.trace).toMatchObject({ strength: 4, link: 2, needed: 2 });
    const r = act(s, bid('runner', 2));
    expect(r.events).toContainEqual({ type: 'trace_resolved', cardId: 'c20', strength: 4, total: 4, success: false });
    expect(r.state.players.runner.tags).toBe(0);
  });

  it('one credit short of the tie: tagged', () => {
    const spec = { rig: ['r18'], corpCredits: 5, runnerCredits: 5 };
    const s = act(act(atIce('c20', spec), letFire).state, bid('corp', 1)).state;
    const r = act(s, bid('runner', 1));
    expect(r.events).toContainEqual({ type: 'trace_resolved', cardId: 'c20', strength: 4, total: 3, success: true });
    expect(r.state.players.runner.tags).toBe(1);
  });
});

describe('S-09-1 AC6: a bid that cannot matter is made for the player at once (0, auto, no window)', () => {
  it('Corp with 0 credits: bids 0 at once, straight to the Runner’s window (no Corp hand-off)', () => {
    const r = act(atIce('c20', { corpCredits: 0, runnerCredits: 5 }), letFire);
    expect(r.events).toEqual([
      { type: 'subroutine_fired', iceUid: iceUid(), sub: 0 },
      { type: 'trace_started', cardId: 'c20', base: 3, link: 1 },
      { type: 'trace_bid', player: 'corp', credits: 0, total: 3, auto: true },
      { type: 'choice_opened', kind: 'trace_runner', player: 'runner', cardId: 'c20' },
    ]);
    expect(viewFor('runner', r.state).choice!.trace).toMatchObject({ strength: 3, corpBid: 0, needed: 2 });
    clean(r, 'Corp broke');
  });

  it('both sides with 0 credits: no window at all; the preview shows the tag', () => {
    const s = atIce('c20', { corpCredits: 0, runnerCredits: 0 });
    expect(viewFor('runner', s).run!.letFire).toEqual({ iceCardId: 'c20', outcomes: [{ sub: 0, op: 'trace', amount: 1 }], ends: null });
    const r = act(s, letFire);
    expect(r.events).toEqual([
      { type: 'subroutine_fired', iceUid: iceUid(), sub: 0 },
      { type: 'trace_started', cardId: 'c20', base: 3, link: 1 },
      { type: 'trace_bid', player: 'corp', credits: 0, total: 3, auto: true },
      { type: 'trace_bid', player: 'runner', credits: 0, total: 1, auto: true },
      { type: 'trace_resolved', cardId: 'c20', strength: 3, total: 1, success: true },
      { type: 'tags_changed', amount: 1, tags: 1 },
      { type: 'subroutine_resolved', iceUid: iceUid(), cardId: 'c20', outcome: { sub: 0, op: 'trace', amount: 1 } },
      { type: 'ice_passed', uid: iceUid() },
    ]);
    clean(r, 'no windows');
  });

  it('the Corp cannot beat the link even with everything (base + credits ≤ link): not asked; the trace fails', () => {
    // Link 3 (Kate + 2 Access to Globalsec) vs Hunter's Trace 3 with 0 credits; and vs Ichi's Trace 1 with 2 credits.
    const hunter = act(atIce('c20', { rig: ['r18', 'r18'], corpCredits: 0 }), letFire);
    expect(types(hunter.events)).toEqual(['subroutine_fired', 'trace_started', 'trace_bid', 'trace_bid', 'trace_resolved', 'subroutine_resolved', 'ice_passed']);
    expect(hunter.events[4]).toEqual({ type: 'trace_resolved', cardId: 'c20', strength: 3, total: 3, success: false });
    const rig = ['r18', 'r18'];
    const ichi = act(atIce('c21', { rig, corpCredits: 2 }), letFire);
    expect(ichi.events.filter((e) => e.type === 'trace_bid')).toEqual([
      { type: 'trace_bid', player: 'corp', credits: 0, total: 1, auto: true },
      { type: 'trace_bid', player: 'runner', credits: 0, total: 3, auto: true },
    ]);
    expect(ichi.state.players.corp.credits).toBe(2);
    // One more Corp credit and it would be worth asking.
    const asked = act(atIce('c21', { rig, corpCredits: 3 }), letFire);
    expect(asked.events.at(-1)).toEqual({ type: 'choice_opened', kind: 'trace_corp', player: 'corp', cardId: 'c21' });
  });

  it('the Runner cannot reach the strength (needed > what he can spend): not asked; tagged', () => {
    const s = act(atIce('c20', { corpCredits: 10, runnerCredits: 5 }), letFire).state;
    const r = act(s, bid('corp', 6)); // strength 9, needed 8 > 5
    expect(r.events.slice(-5)).toEqual([
      { type: 'trace_bid', player: 'runner', credits: 0, total: 1, auto: true },
      { type: 'trace_resolved', cardId: 'c20', strength: 9, total: 1, success: true },
      { type: 'tags_changed', amount: 1, tags: 1 },
      { type: 'subroutine_resolved', iceUid: iceUid(), cardId: 'c20', outcome: { sub: 0, op: 'trace', amount: 1 } },
      { type: 'ice_passed', uid: iceUid() },
    ]);
    expect(r.state.players.runner.credits).toBe(5);
    clean(r, 'hopeless');
  });

  it('the Corp bids 0 and the trace already fails (strength ≤ link): the Runner is not asked', () => {
    const s = act(atIce('c20', { rig: ['r18', 'r18'], corpCredits: 3 }), letFire).state;
    expect(s.choice?.kind).toBe('trace_corp');
    const r = act(s, bid('corp', 0));
    expect(types(r.events)).toEqual(['choice_closed', 'trace_bid', 'trace_bid', 'trace_resolved', 'subroutine_resolved', 'ice_passed']);
    expect(r.events[1]).toEqual({ type: 'trace_bid', player: 'corp', credits: 0, total: 3 });
    expect(r.events[2]).toEqual({ type: 'trace_bid', player: 'runner', credits: 0, total: 3, auto: true });
  });

  it('Runner with 0 credits and a needed bid: not asked (0 < needed but nothing to spend)', () => {
    const s = act(atIce('c20', { corpCredits: 3, runnerCredits: 0 }), letFire).state;
    const r = act(s, bid('corp', 0));
    expect(r.events).toContainEqual({ type: 'trace_bid', player: 'runner', credits: 0, total: 1, auto: true });
    expect(r.state.players.runner.tags).toBe(1);
  });
});

describe('S-09-1: bids during a run may use the Runner’s bad-publicity credits (paid first)', () => {
  it('1 own credit + 2 run-only credits: max bid 3; bidding 2 spends the run-only credits', () => {
    const s0 = board({ servers: { hq: { ice: ['+c20'] } }, corpCredits: 0, runnerCredits: 1 }, 77, CORE);
    const s = act(act({ ...s0, badPublicity: 2 }, runHq).state, letFire).state;
    expect(viewFor('runner', s).choice!.trace).toMatchObject({ runnerMaxBid: 3, needed: 2 });
    expect(viewFor('runner', s).choice!.options).toHaveLength(4);
    const r = act(s, bid('runner', 2));
    expect(r.events[1]).toEqual({ type: 'credits_spent', player: 'runner', amount: 2, temp: 2 });
    expect(r.state.players.runner.credits).toBe(1);
    expect(r.state.run?.tempCredits).toBe(0);
    expect(r.state.players.runner.tags).toBe(0);
  });
});

describe('S-09-1: trace_bid refusals and other actions during a bid', () => {
  it('in the Corp window: Runner bid not_your_turn, too much no_credits, pass bad_target, rez/choose wrong_phase', () => {
    const s = act(atIce('c20', { corpCredits: 4 }), letFire).state;
    expect(rejection(apply(s, bid('runner', 0)).events)).toBe('not_your_turn');
    expect(rejection(apply(s, bid('corp', 5)).events)).toBe('no_credits');
    expect(rejection(apply(s, bid('corp', -1)).events)).toBe('invalid_action');
    expect(rejection(apply(s, { type: 'pass', player: 'corp' }).events)).toBe('bad_target');
    expect(rejection(apply(s, { type: 'rez', player: 'corp', uid: iceUid() }).events)).toBe('wrong_phase');
    expect(rejection(apply(s, { type: 'choose', player: 'corp', uid: 'i1' }).events)).toBe('wrong_phase');
    expect(rejection(apply(s, { type: 'jack_out', player: 'runner' }).events)).toBe('not_your_turn');
    expect(rejection(apply(s, bid('corp', 4)).events)).toBeNull();
  });

  it('in the Runner window: the Corp may not bid again; the Runner may not bid more than he has', () => {
    const s = act(act(atIce('c20', { corpCredits: 4, runnerCredits: 3 }), letFire).state, bid('corp', 1)).state;
    expect(rejection(apply(s, bid('corp', 0)).events)).toBe('not_your_turn');
    expect(rejection(apply(s, bid('runner', 4)).events)).toBe('no_credits');
    expect(rejection(apply(s, { type: 'pass', player: 'runner' }).events)).toBe('bad_target');
  });

  it('outside a trace: wrong_phase', () => {
    expect(rejection(apply(atIce('c20'), bid('runner', 0)).events)).toBe('wrong_phase');
  });

  it('pure: the same bids from the same state give the same result; the input state is untouched', () => {
    const s = act(atIce('c20', { corpCredits: 4 }), letFire).state;
    const snapshot = JSON.stringify(s);
    const a = act(act(s, bid('corp', 3)).state, bid('runner', 2));
    const b = act(act(s, bid('corp', 3)).state, bid('runner', 2));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});
