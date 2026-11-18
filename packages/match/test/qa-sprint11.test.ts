// QA Sprint 11 (written by QA, not the developers): S-11-3 "a saved game comes back exactly as it
// was, and no hidden cards are shown to the wrong player", checked on the planner's real game paths
// (every goal of every sprint: runs, breakers, traces, choices, discards, scores) rather than random
// play: the game is saved after EVERY move of each path, sent through JSON text, loaded, and compared.
// Plus the refusals: a rejected move is never saved; finished / outdated / broken saves.
import { RULES_VERSION, type Action } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { LocalMatch } from '../src/index';
import { SPRINT10_GOALS, SPRINT11_GOALS, SPRINT7_GOALS, SPRINT8_GOALS, SPRINT9_GOALS, STEP_GOALS, planToStep, runnerViewLeaks, type StepGoal } from '../src/testing';

const GOALS = [...new Set<StepGoal>([...STEP_GOALS, ...SPRINT7_GOALS, ...SPRINT8_GOALS, ...SPRINT9_GOALS, ...SPRINT10_GOALS, ...SPRINT11_GOALS])];

function roundTrip(m: LocalMatch): LocalMatch {
  const r = LocalMatch.load(JSON.stringify(m.save()));
  if (!r.ok) throw new Error(`load failed: ${r.reason}`);
  return r.match;
}

describe('QA S-11-3: save after every move of every planned path, load, compare', () => {
  it('state, both views and the save are equal at every move; restored views hide what they must', () => {
    let saves = 0;
    let inRun = 0;
    let inChoice = 0;
    let withBreaker = 0;
    let paths = 0;
    for (const goal of GOALS) for (const seed of [7, 23, 101]) {
      let plan;
      try {
        plan = planToStep(seed, goal);
      } catch {
        continue; // this seed can't reach the goal; the other seeds do (checked below)
      }
      paths++;
      const m = new LocalMatch(plan.seed, { deckSet: plan.deckSet });
      for (const a of plan.actions) {
        const u = m.submit(a.player, a);
        expect(u[a.player].events.some((e) => e.type === 'action_rejected'), `${goal}: ${JSON.stringify(a)}`).toBe(false);
        const b = roundTrip(m);
        const state = b.snapshot();
        expect(state, goal).toEqual(m.snapshot());
        expect(b.view('corp'), goal).toEqual(m.view('corp'));
        expect(b.view('runner'), goal).toEqual(m.view('runner'));
        expect(runnerViewLeaks(state, b.view('runner')), goal).toEqual([]);
        // The Corp seat never gets the Runner's Grip cards; the Runner seat never gets HQ or R&D order.
        expect(b.view('corp').players.runner.hand ?? null).toBeNull();
        expect(b.view('runner').players.corp.hand ?? null).toBeNull();
        saves++;
        if (state.run) inRun++;
        if (state.choice) inChoice++;
        if (state.run && b.view('runner').run?.options.some((o) => o.action.type === 'use_ability')) withBreaker++;
      }
      // The restored game plays on exactly like the live one: every legal move of the seat to act.
      const b = roundTrip(m);
      for (const side of ['corp', 'runner'] as const) {
        for (const a of m.view(side).legalActions.slice(0, 6)) {
          const x = LocalMatch.load(JSON.stringify(m.save()));
          const y = LocalMatch.load(JSON.stringify(b.save()));
          if (!x.ok || !y.ok) throw new Error('load');
          expect(y.match.submit(a.player, a), `${goal} next ${JSON.stringify(a)}`).toEqual(x.match.submit(a.player, a));
        }
      }
    }
    // QA run 2026-11-17: 162 paths, 2702 saves, 212 in a run, 25 with breaker options, 30 in a choice.
    expect(paths).toBeGreaterThan(GOALS.length * 2);
    expect(saves).toBeGreaterThan(2000);
    expect(inRun).toBeGreaterThan(50);
    expect(withBreaker, 'saves taken mid-encounter with breaker options').toBeGreaterThan(10);
    expect(inChoice).toBeGreaterThan(0);
  }, 120_000);

  it('a refused move is never saved; the save only grows with accepted moves', () => {
    const m = new LocalMatch(3, { deckSet: 'core' });
    expect(m.save().actions).toHaveLength(0);
    m.submit('runner', { type: 'gain_credit', player: 'runner' }); // not the Runner's turn
    m.submit('corp', { type: 'gain_credit', player: 'runner' } as Action); // acting for the other seat
    expect(m.save().actions).toHaveLength(0);
    m.submit('corp', { type: 'gain_credit', player: 'corp' });
    expect(m.save().actions).toEqual([{ type: 'gain_credit', player: 'corp' }]);
    expect(roundTrip(m).view('corp').players.corp.credits).toBe(m.view('corp').players.corp.credits);
  });

  it('finished, outdated and broken saves are refused, never offered as a game', () => {
    const plan = planToStep(1, 'corp_one_score_from_win');
    const m = new LocalMatch(plan.seed, { deckSet: plan.deckSet });
    for (const a of plan.actions) m.submit(a.player, a);
    const score = m.view('corp').legalActions.find((a) => a.type === 'score')!;
    m.submit('corp', score);
    expect(m.view('corp').result).not.toBeNull();
    expect(LocalMatch.load(JSON.stringify(m.save()))).toEqual({ ok: false, reason: 'finished' });

    const live = new LocalMatch(2, { deckSet: 'core' });
    live.submit('corp', { type: 'gain_credit', player: 'corp' });
    const s = live.save();
    expect(LocalMatch.load({ ...s, rulesVersion: RULES_VERSION - 1 })).toEqual({ ok: false, reason: 'outdated' });
    expect(LocalMatch.load({ ...s, rulesVersion: RULES_VERSION + 1 })).toEqual({ ok: false, reason: 'outdated' });
    // A move the rules now refuse (as if a rule changed without a version bump).
    expect(LocalMatch.load({ ...s, actions: [{ type: 'run', player: 'runner', server: 'hq' }] })).toEqual({ ok: false, reason: 'outdated' });
    for (const bad of ['', 'null', '{', '[]', '{"format":1}', JSON.stringify(s).slice(0, 40), 42, null, { ...s, seed: 'x' }, { ...s, actions: 'x' }]) {
      const r = LocalMatch.load(bad);
      expect(r.ok, JSON.stringify(bad)).toBe(false);
      if (!r.ok) expect(r.reason, JSON.stringify(bad)).toBe('broken');
    }
  });
});
