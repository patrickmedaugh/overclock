// Sprint 11 E3: the planToStep goal for the S-11-1 / S-11-2 e2e (core decks): a rezzed Ice Wall with
// Battering Ram and Gordian Blade installed, in pass-the-phone and online games.
import { LocalMatch, type MatchUpdate } from '../src/index';
import { replay, type Action, type GameOptions } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import {
  SPRINT10_GOALS,
  SPRINT11_GOALS,
  SPRINT7_GOALS,
  SPRINT8_GOALS,
  SPRINT9_GOALS,
  STEP_GOALS,
  goalDeckSet,
  planToStep,
  runnerEventLeaks,
  runnerViewLeaks,
} from '../src/testing';

const MODES: [string, Partial<GameOptions>][] = [
  ['pass-the-phone', {}],
  ['online', { rezWindow: 'always' }],
];
const SEEDS = [1, 7, 42, 12345];
const GOAL = 'ice_wall_ram_gordian';

function setup(seed: number, options: Partial<GameOptions>) {
  const plan = planToStep(seed, GOAL, 1500, options);
  expect(plan.deckSet).toBe('core');
  const m = new LocalMatch(seed, { ...options, deckSet: plan.deckSet });
  for (const a of plan.actions) expect(m.submit(a.player, a)[a.player].events.some((e) => e.type === 'action_rejected')).toBe(false);
  return { plan, m, info: plan.info as Record<string, string> };
}

function ok(m: LocalMatch, a: Action): MatchUpdate {
  const u = m.submit(a.player, a);
  expect(u[a.player].events.find((e) => e.type === 'action_rejected'), JSON.stringify(a)).toBeUndefined();
  const state = replay(m.seed, m.actions(), m.options).state;
  expect(runnerEventLeaks(u.runner.events, state)).toEqual([]);
  expect(runnerViewLeaks(state, u.runner.view)).toEqual([]);
  return u;
}

describe('Sprint 11 planToStep goal ice_wall_ram_gordian', () => {
  it('is a core-deck goal separate from the earlier lists', () => {
    expect(SPRINT11_GOALS).toEqual([GOAL]);
    for (const list of [STEP_GOALS, SPRINT7_GOALS, SPRINT8_GOALS, SPRINT9_GOALS, SPRINT10_GOALS]) expect(list).not.toContain(GOAL);
    expect(goalDeckSet(GOAL)).toBe('core');
  });

  it('works for seeds 1-100 and 12345, pass-the-phone and online; the plans replay', () => {
    for (const seed of [...Array.from({ length: 100 }, (_, i) => i + 1), 12345]) {
      for (const [, options] of MODES) {
        const p = planToStep(seed, GOAL, 1500, options);
        const r = replay(seed, p.actions, { ...options, deckSet: p.deckSet });
        expect(r.events.some((e) => e.type === 'action_rejected'), `${seed}`).toBe(false);
      }
    }
  }, 120_000);

  describe.each(MODES)('%s', (_mode, options) => {
    it.each(SEEDS)('seed %i: Ice Wall rezzed, Ram and Gordian installed, one open subroutine; info is right', (seed) => {
      const { m, info } = setup(seed, options);
      const v = m.view('runner');
      expect(v.run?.step).toBe('encounter');
      expect(v.run?.iceUid).toBe(info.iceUid);
      expect(v.run?.ice?.cardId).toBe('c05');
      expect(v.run?.ice?.subroutines).toHaveLength(1);
      expect(String(v.run?.ice?.strength)).toBe(info.iceStrength);
      expect(v.rig.find((c) => c.uid === info.ramUid)?.cardId).toBe('r17');
      expect(v.rig.find((c) => c.uid === info.gordianUid)?.cardId).toBe('r05');
      expect(info.breakerUid).toBe(info.ramUid);
      expect(v.players.runner.credits).toBeGreaterThanOrEqual(3);
      expect(v.run?.options.some((o) => o.action.type === 'pass' && o.reject === null)).toBe(true);
    });

    it.each(SEEDS)('seed %i: Ram offers one break (subs [0]) and a pump; Gordian Blade offers no break', (seed) => {
      const { m, info } = setup(seed, options);
      const opts = m.view('runner').run!.options;
      const of = (uid: string, ability: number) => opts.filter((o) => o.action.type === 'use_ability' && o.action.uid === uid && o.action.ability === ability);
      const breaks = of(info.ramUid!, 0);
      expect(breaks).toHaveLength(1);
      expect(breaks[0]!.action).toMatchObject({ subs: [0] });
      expect(breaks[0]!.reject).toBeNull();
      expect(breaks[0]!.cost).toBe(2);
      expect(of(info.ramUid!, 1).map((o) => o.cost)).toEqual([1]);
      expect(of(info.gordianUid!, 0).filter((o) => o.reject === null)).toEqual([]);
    });

    it.each(SEEDS)('seed %i: tapping Ram\'s break breaks the subroutine at once and pays 2 (S-11-2 AC1)', (seed) => {
      const { m, info } = setup(seed, options);
      const before = m.view('runner').players.runner.credits;
      const brk = m.view('runner').run!.options.find((o) => o.action.type === 'use_ability' && o.action.uid === info.ramUid && o.action.ability === 0)!;
      const u = ok(m, brk.action);
      for (const side of ['corp', 'runner'] as const) {
        expect(u[side].events.slice(0, 2)).toEqual([
          { type: 'credits_spent', player: 'runner', amount: 2 },
          { type: 'subroutine_broken', iceUid: info.iceUid, sub: 0, breakerUid: info.ramUid },
        ]);
      }
      expect(u.runner.view.players.runner.credits).toBe(before - 2);
    });
  });
});
