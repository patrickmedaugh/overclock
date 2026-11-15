// Sprint 8 E6 (S-08-4): Sure Gamble, Magnum Opus, Pipeline, Battering Ram ("break up to 2"), memory.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, viewEvents, viewFor, type Action, type GameEvent, type GameState } from '../src/index';
import { act, board, finishTurn, rejection, run, withPlayer, type BoardSpec } from './helpers';

const CORE = { deckSet: 'core' } as const;
const types = (events: readonly GameEvent[]) => events.map((e) => e.type);
const runHq: Action = { type: 'run', player: 'runner', server: 'hq' };
const use = (uid: string, ability: number, extra: { sub?: number; subs?: number[] } = {}): Action => ({ type: 'use_ability', player: 'runner', uid, ability, ...extra });

function atHq(ice: string[], spec: Omit<BoardSpec, 'servers'> = {}): GameState {
  return act(board({ ...spec, servers: { hq: { ice } } }, 77, CORE), runHq).state;
}

describe('S-08-4 AC1: Sure Gamble — 5 credits → 9', () => {
  it('pays 5, gains 9', () => {
    const s = board({ runnerHand: ['r14'], runnerCredits: 5 }, 77, CORE);
    const r = act(s, { type: 'play', player: 'runner', handIndex: 0 });
    expect(r.events).toEqual([
      { type: 'credits_spent', player: 'runner', amount: 5 },
      { type: 'card_played', player: 'runner', cardId: 'r14', handIndex: 0 },
      { type: 'credit_gained', player: 'runner', amount: 9 },
    ]);
    expect(r.state.players.runner.credits).toBe(9);
    expect(rejection(apply(withPlayer(s, 'runner', { credits: 4 }), { type: 'play', player: 'runner', handIndex: 0 }).events)).toBe('no_credits');
  });
});

describe('S-08-4 AC2: Magnum Opus — Click: gain 2 credits, never runs out', () => {
  it('installed: one activate option (clicks 1, gain 2); it works every click and never trashes itself', () => {
    let s = board({ rig: ['r15'], runnerCredits: 0, runnerClicks: 4 }, 77, CORE);
    const a: Action = { type: 'activate', player: 'runner', uid: 'i1', ability: 0 };
    expect(viewFor('runner', s).installedOptions['i1']).toEqual([{ action: a, cost: 0, reject: null, clicks: 1, gain: 2 }]);
    const r = act(s, a);
    expect(r.events).toEqual([
      { type: 'ability_triggered', uid: 'i1', cardId: 'r15', trigger: 'click' },
      { type: 'credit_gained', player: 'runner', amount: 2 },
    ]);
    s = run(r.state, [a, a, a]).state;
    expect(s.players.runner.credits).toBe(8);
    expect(s.players.runner.clicks).toBe(0);
    expect(s.rig.map((c) => c.cardId)).toEqual(['r15']);
    expect(viewFor('runner', s).installedOptions['i1']![0]).toMatchObject({ reject: 'no_clicks', gain: 2 });
    expect(viewEvents('corp', r.events)).toEqual(r.events);
  });

  it('Kate pays 4 for it (program discount)', () => {
    const s = board({ runnerHand: ['r15'], runnerCredits: 4 }, 77, CORE);
    expect(viewFor('runner', s).handOptions[0]![0]).toMatchObject({ cost: 4, discount: 1, reject: null });
  });
});

describe('S-08-4 AC3: Pipeline (strength 1) vs Neural Katana (strength 3)', () => {
  it('2 credits twice → strength 3 for the rest of the run, then 1 credit breaks the subroutine', () => {
    let s = atHq(['+c05', '+c07'], { rig: ['r16'], runnerCredits: 5 }); // Ice Wall inner, Katana outer
    expect(s.run?.step).toBe('encounter');
    const pump = use('i1', 1);
    expect(viewFor('runner', s).run!.options.find((o) => o.action.type === 'use_ability' && o.action.ability === 1)).toMatchObject({ cost: 2, reject: null });
    expect(viewFor('runner', s).run!.options.find((o) => o.action.type === 'use_ability' && o.action.ability === 0)).toMatchObject({ cost: 1, reject: 'too_weak' });
    s = run(s, [pump, pump]).state;
    expect(viewFor('runner', s).run!.breakerStrength['i1']).toBe(3);
    const r = act(s, use('i1', 0, { sub: 0 }));
    expect(types(r.events)).toEqual(['credits_spent', 'subroutine_broken', 'ice_passed']);
    expect(r.state.players.runner.credits).toBe(0);
    // The extra strength stays for the rest of the run (next ICE, Ice Wall).
    s = act(r.state, { type: 'pass', player: 'runner' }).state;
    expect(s.run?.step).toBe('encounter');
    expect(viewFor('runner', s).run!.breakerStrength['i1']).toBe(3);
    // …and drops when the run ends.
    const end = act(s, { type: 'pass', player: 'runner' });
    expect(end.events).toContainEqual({ type: 'strength_changed', uid: 'i1', strength: 1 });
  });
});

describe('S-08-4 AC4: Battering Ram — break up to 2 barrier subroutines for one payment', () => {
  const ram = 'i1';
  it('Heimdall 1.0 (strength 6): 3 pumps (1 each, for the run), then one option per 1–2 subroutines (6)', () => {
    let s = atHq(['+c18'], { rig: ['r17'], runnerCredits: 10 });
    s = run(s, [use(ram, 1), use(ram, 1), use(ram, 1)]).state;
    expect(viewFor('runner', s).run!.breakerStrength[ram]).toBe(6);
    const breaks = viewFor('runner', s).run!.options.filter((o) => o.action.type === 'use_ability' && o.action.ability === 0);
    expect(breaks.map((o) => (o.action.type === 'use_ability' ? o.action.subs : null))).toEqual([[0], [1], [2], [0, 1], [0, 2], [1, 2]]);
    expect(breaks.every((o) => o.cost === 2 && o.reject === null)).toBe(true);
    expect(breaks.every((o) => o.action.type === 'use_ability' && o.action.sub === undefined)).toBe(true);
    const r = act(s, use(ram, 0, { subs: [0, 2] }));
    expect(r.events).toEqual([
      { type: 'credits_spent', player: 'runner', amount: 2 },
      { type: 'subroutine_broken', iceUid: 'i2', sub: 0, breakerUid: ram },
      { type: 'subroutine_broken', iceUid: 'i2', sub: 2, breakerUid: ram },
    ]);
    expect(r.state.players.runner.credits).toBe(5);
    expect(viewFor('runner', r.state).run!.ice!.subroutines.map((x) => x.broken)).toEqual([true, false, true]);
    // Only the unbroken one is left to pick.
    const left = viewFor('runner', r.state).run!.options.filter((o) => o.action.type === 'use_ability' && o.action.ability === 0);
    expect(left.map((o) => (o.action.type === 'use_ability' ? o.action.subs : null))).toEqual([[1]]);
    const last = act(r.state, use(ram, 0, { subs: [1] }));
    expect(types(last.events)).toEqual(['credits_spent', 'subroutine_broken', 'ice_passed']);
    expect(viewEvents('corp', last.events)).toEqual(last.events);
  });

  it('rejections: subs required for Ram, forbidden for 1-at-a-time breakers; 1–2 distinct unbroken ascending', () => {
    let s = atHq(['+c18'], { rig: ['r17', 'r04'], runnerCredits: 20 });
    s = run(s, [use(ram, 1), use(ram, 1), use(ram, 1)]).state;
    const bad = (a: Action) => rejection(apply(s, a).events);
    expect(bad(use(ram, 0, { sub: 0 }))).toBe('bad_target');
    expect(bad(use(ram, 0))).toBe('bad_target');
    expect(bad(use(ram, 0, { subs: [] }))).toBe('bad_target');
    expect(bad(use(ram, 0, { subs: [0, 1, 2] }))).toBe('bad_target');
    expect(bad(use(ram, 0, { subs: [1, 0] }))).toBe('bad_target');
    expect(bad(use(ram, 0, { subs: [1, 1] }))).toBe('bad_target');
    expect(bad(use(ram, 0, { subs: [3] }))).toBe('bad_target');
    expect(bad(use(ram, 0, { sub: 0, subs: [0] }))).toBe('invalid_action');
    expect(bad({ type: 'use_ability', player: 'runner', uid: ram, ability: 0, subs: 'x' } as unknown as Action)).toBe('invalid_action');
    expect(bad(use('i2', 0, { subs: [0] }))).toBe('invalid_action'); // Corroder breaks one at a time
    expect(bad(use(ram, 1, { subs: [0] }))).toBe('invalid_action'); // its pump
    const broke = act(s, use(ram, 0, { subs: [0] })).state;
    expect(rejection(apply(broke, use(ram, 0, { subs: [0, 1] })).events)).toBe('bad_target');
    // Strength below the ICE: too_weak; money: no_credits.
    const weak = atHq(['+c18'], { rig: ['r17'], runnerCredits: 1 });
    expect(rejection(apply(weak, use(ram, 0, { subs: [0, 1] })).events)).toBe('too_weak');
    const poor = withPlayer(s, 'runner', { credits: 1 });
    expect(rejection(apply(poor, use(ram, 0, { subs: [0, 1] })).events)).toBe('no_credits');
  });

  it('legalActions offers exactly the listed subsets; the AI-visible options never name a code gate', () => {
    const s = atHq(['+c04'], { rig: ['r17'], runnerCredits: 5 }); // Wall of Static: 1 subroutine, strength 3
    const legal = legalActions(s, 'runner').filter((a) => a.type === 'use_ability');
    expect(legal).toEqual([use(ram, 0, { subs: [0] }), use(ram, 1)]);
    expect(atHq(['+c17'], { rig: ['r17'] }).run!.step).toBe('encounter');
    expect(viewFor('runner', atHq(['+c17'], { rig: ['r17'] })).run!.options.filter((o) => o.action.type === 'use_ability')).toEqual([]);
  });

  it('its pump lasts the whole run (real text: "for the remainder of this run")', () => {
    let s = atHq(['+c05', '+c04'], { rig: ['r17'], runnerCredits: 5 }); // Ice Wall inner, Wall of Static outer
    s = act(s, use(ram, 0, { subs: [0] })).state; // strength 3 = Wall of Static
    s = act(s, { type: 'pass', player: 'runner' }).state; // continue → Ice Wall
    expect(viewFor('runner', s).run!.breakerStrength[ram]).toBe(3);
    s = act(atHq(['+c18'], { rig: ['r17'], runnerCredits: 5 }), use(ram, 1)).state;
    expect(viewFor('runner', s).run!.breakerStrength[ram]).toBe(4);
  });
});

describe('S-08-4 AC5: Battering Ram (2), Gordian Blade (1), Pipeline (1), Magnum Opus (2) need 6 memory; Kate has 4', () => {
  it('the last one is refused with no_memory without Akamatsu Mem Chip; with it, the 5th memory fits Pipeline', () => {
    let s = board({ runnerHand: ['r17', 'r05', 'r16', 'r15'], runnerCredits: 30, runnerClicks: 4 }, 77, CORE);
    const install: Action = { type: 'install', player: 'runner', handIndex: 0 };
    s = run(s, [install, install, install]).state;
    expect(viewFor('runner', s).memory).toEqual({ used: 4, limit: 4 });
    expect(viewFor('runner', s).handOptions[0]![0]).toMatchObject({ reject: 'no_memory' });
    expect(rejection(apply(s, install).events)).toBe('no_memory');
    let t = board({ runnerHand: ['r09', 'r17', 'r05', 'r15', 'r16'], runnerCredits: 30, runnerClicks: 4 }, 77, CORE);
    t = run(t, [install, install, install, install]).state; // Akamatsu, Ram, Gordian, Magnum Opus: 5/5
    t = finishTurn(finishTurn(t).state).state;
    expect(viewFor('runner', t).memory).toEqual({ used: 5, limit: 5 });
    expect(rejection(apply(t, install).events)).toBe('no_memory');
  });
});
