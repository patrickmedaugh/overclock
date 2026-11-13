import { replay, viewFor, waitingOn } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { LocalMatch } from '../src/index';
import { STEP_GOALS, planToStep, stepReached, type StepGoal } from '../src/testing';

const SEEDS = [1, 2, 3, 7, 42, 99, 12345];
/** Seeds whose R&D order lets the Corp reach 7 points (see StepGoal docs). */
const CORP_WIN_SEEDS = [1, 2, 3, 4, 5, 7, 12345];
const seedsFor = (goal: StepGoal) => (goal === 'corp_one_score_from_win' ? CORP_WIN_SEEDS : SEEDS);

describe('planToStep (Sprint 3 e2e setup helper)', () => {
  describe.each(STEP_GOALS)('%s', (goal: StepGoal) => {
    it.each(seedsFor(goal))('seed %i: reached by a real game, every action accepted, replayable', (seed) => {
      const plan = planToStep(seed, goal);
      const m = new LocalMatch(seed);
      for (const a of plan.actions) {
        const u = m.submit(a.player, a);
        expect(u[a.player].events.some((e) => e.type === 'action_rejected')).toBe(false);
      }
      const views = { corp: m.view('corp'), runner: m.view('runner') };
      expect(stepReached(goal, views)).toBe(true);
      expect(views.corp.run?.waitingOn ?? views.corp.activePlayer).toBe(plan.waitingOn);
      const state = replay(seed, plan.actions).state;
      expect(waitingOn(state)).toBe(plan.waitingOn);
      expect(viewFor('runner', state)).toEqual(views.runner);
    });
  });

  it('every goal but corp_one_score_from_win works for seeds 1-40; that one for most seeds 1-100', () => {
    for (const goal of STEP_GOALS.filter((g) => g !== 'corp_one_score_from_win')) {
      for (let seed = 1; seed <= 40; seed++) expect(() => planToStep(seed, goal), `${goal} ${seed}`).not.toThrow();
    }
    let ok = 0;
    for (let seed = 1; seed <= 100; seed++) {
      try {
        planToStep(seed, 'corp_one_score_from_win');
        ok++;
      } catch {
        // R&D order: Priority Requisition too deep to reach 7 before the deck runs out.
      }
    }
    expect(ok).toBeGreaterThanOrEqual(75);
  });

  it('is deterministic for a seed', () => {
    expect(planToStep(5, 'wall_of_static_encounter')).toEqual(planToStep(5, 'wall_of_static_encounter'));
  });

  it('info names what the e2e needs', () => {
    const w = planToStep(1, 'wall_of_static_encounter');
    const v = new LocalMatch(1);
    for (const a of w.actions) v.submit(a.player, a);
    const run = v.view('runner').run!;
    expect(w.info).toEqual({ server: run.server, iceUid: run.iceUid, breakerUid: v.view('runner').rig.find((c) => c.cardId === 'r04')!.uid });
    expect(run.options.find((o) => o.action.type === 'use_ability' && o.reject === null)?.cost).toBe(1);
    const a = planToStep(1, 'agenda_one_advance');
    expect(Object.keys(a.info).sort()).toEqual(['cardId', 'server', 'uid']);
  });
});
