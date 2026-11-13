import { newGame, replay, viewFor, waitingOn, type Action } from '@overclock/engine';
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
    for (const goal of STEP_GOALS.filter((g) => g !== 'corp_one_score_from_win' && g !== 'corp_score_priority_requisition')) {
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

  it('Sprint 4: corp_score_priority_requisition works unless Priority Requisition is the bottom card of R&D', () => {
    let ok = 0;
    for (let seed = 1; seed <= 100; seed++) {
      try {
        planToStep(seed, 'corp_score_priority_requisition');
        ok++;
      } catch {
        // PR drawn last: the Corp decks out before it can advance it 5 times.
        expect(newGame(seed).players.corp.deck.at(-1), `seed ${seed}`).toBe('c10');
      }
    }
    expect(ok).toBeGreaterThanOrEqual(90);
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

  describe('Sprint 4 goals: the bonus happens through the seats (S-04-4 AC1-AC3 setup)', () => {
    const play = (seed: number, goal: StepGoal) => {
      const plan = planToStep(seed, goal);
      const m = new LocalMatch(seed);
      for (const a of plan.actions) m.submit(a.player, a);
      return { plan, m };
    };

    it.each(SEEDS)('seed %i corp_score_hostile_takeover: Score gives +7 credits and 1 bad publicity, seen by both seats', (seed) => {
      const { plan, m } = play(seed, 'corp_score_hostile_takeover');
      expect(plan.info.cardId).toBe('c08');
      const credits = m.view('corp').players.corp.credits;
      const u = m.submit('corp', { type: 'score', player: 'corp', uid: plan.info.uid! });
      const bp = u.corp.view.badPublicity;
      expect(bp).toBeGreaterThanOrEqual(1);
      expect(u.corp.events).toEqual([
        { type: 'agenda_scored', uid: plan.info.uid, cardId: 'c08', points: 1 },
        { type: 'credit_gained', player: 'corp', amount: 7 },
        { type: 'bad_publicity_gained', amount: 1, total: bp },
      ]);
      expect(u.runner.events).toEqual(u.corp.events);
      expect(u.runner.view.badPublicity).toBe(bp);
      expect(u.runner.view.players.corp.credits).toBe(credits + 7);
    });

    it.each(SEEDS)('seed %i corp_score_priority_requisition: Score opens the choice; Corp options, Runner none; free rez', (seed) => {
      const { plan, m } = play(seed, 'corp_score_priority_requisition');
      expect(plan.info.cardId).toBe('c10');
      const u = m.submit('corp', { type: 'score', player: 'corp', uid: plan.info.uid! });
      expect(u.corp.events.at(-1)).toEqual({ type: 'choice_opened', kind: 'free_rez', player: 'corp', cardId: 'c10' });
      expect(u.runner.events).toEqual(u.corp.events);
      const rez: Action = { type: 'rez', player: 'corp', uid: plan.info.iceUid! };
      expect(u.corp.view.choice!.options).toContainEqual({ action: rez, cost: 0, reject: null });
      expect(u.corp.view.choice!.options.at(-1)).toEqual({ action: { type: 'pass', player: 'corp' }, cost: 0, reject: null });
      expect(u.runner.view.choice).toEqual({ kind: 'free_rez', waitingOn: 'corp', cardId: 'c10', options: [] });
      expect(u.runner.view.legalActions).toEqual([]);
      const credits = u.corp.view.players.corp.credits;
      const r = m.submit('corp', rez);
      expect(r.runner.events.map((e) => e.type)).toEqual(['ice_rezzed', 'choice_closed']);
      expect(r.corp.view.players.corp.credits).toBe(credits);
      expect(r.runner.view.corpServers.flatMap((sv) => sv.ice).find((c) => c.uid === plan.info.iceUid)?.faceUp).toBe(true);
      expect(replay(seed, m.actions()).state.phase).toBe('action');
    });

    it.each(SEEDS)('seed %i runner_run_with_bad_publicity: a run on HQ shows the run-only credits, they vanish at the end', (seed) => {
      const { plan, m } = play(seed, 'runner_run_with_bad_publicity');
      const bp = Number(plan.info.badPublicity);
      expect(bp).toBeGreaterThanOrEqual(1);
      expect(plan.waitingOn).toBe('runner');
      const credits = m.view('runner').players.runner.credits;
      const u = m.submit('runner', { type: 'run', player: 'runner', server: 'hq' });
      expect(u.runner.events.slice(0, 2)).toEqual([
        { type: 'run_started', server: 'hq' },
        { type: 'temp_credits_gained', amount: bp },
      ]);
      expect(u.runner.view.run!.tempCredits).toBe(bp);
      expect(u.corp.view.run!.tempCredits).toBe(bp);
      expect(u.runner.view.players.runner.credits).toBe(credits);
      // Finish the access (steal an agenda if one is shown, else Done) until the run ends.
      let last = u;
      while (last.runner.view.run) {
        const opts = last.runner.view.run.options.filter((o) => o.reject === null).map((o) => o.action);
        last = m.submit('runner', opts.find((a) => a.type === 'steal') ?? { type: 'pass', player: 'runner' });
      }
      const types = last.runner.events.map((e) => e.type);
      expect(types.slice(types.indexOf('run_ended') - 1, types.indexOf('run_ended') + 1)).toEqual(['temp_credits_lost', 'run_ended']);
      expect(last.runner.view.players.runner.credits).toBe(credits);
    });
  });

  describe('Sprint 5 goals: ICE outcome and Last run through the seats (S-05-1, S-05-2 setup)', () => {
    const play = (seed: number, goal: StepGoal) => {
      const plan = planToStep(seed, goal);
      const m = new LocalMatch(seed);
      for (const a of plan.actions) m.submit(a.player, a);
      return { plan, m };
    };
    const pass: Action = { type: 'pass', player: 'runner' };

    it.each(SEEDS)('seed %i enigma_encounter: preview "lose 1 click, run ends"; pass reports it to both seats', (seed) => {
      const { plan, m } = play(seed, 'enigma_encounter');
      expect(plan.waitingOn).toBe('runner');
      const run = m.view('runner').run!;
      expect(run.iceUid).toBe(plan.info.iceUid);
      expect(run.letFire).toEqual({
        iceCardId: 'c06',
        outcomes: [
          { sub: 0, op: 'lose_clicks', amount: 1 },
          { sub: 1, op: 'end_run', amount: 0 },
        ],
        ends: 'run',
      });
      expect(m.view('corp').run!.letFire).toBeNull();
      const u = m.submit('runner', pass);
      const outcomes = u.runner.events.flatMap((e) => (e.type === 'subroutine_resolved' ? [e.outcome] : []));
      expect(outcomes).toEqual(run.letFire!.outcomes);
      expect(u.corp.events).toEqual(u.runner.events);
      expect(u.runner.events.at(-1)).toEqual({ type: 'run_ended', server: plan.info.server, outcome: 'ended_by_ice' });
    });

    it.each(SEEDS)('seed %i neural_katana_encounter: preview "take 3 damage", the run goes on', (seed) => {
      const { plan, m } = play(seed, 'neural_katana_encounter');
      const v = m.view('runner');
      expect(v.players.runner.handCount).toBeGreaterThanOrEqual(3);
      expect(v.run!.letFire).toEqual({ iceCardId: 'c07', outcomes: [{ sub: 0, op: 'net_damage', amount: 3 }], ends: null });
      const u = m.submit('runner', pass);
      expect(u.runner.events.filter((e) => e.type === 'subroutine_resolved')).toEqual([
        { type: 'subroutine_resolved', iceUid: plan.info.iceUid, cardId: 'c07', outcome: { sub: 0, op: 'net_damage', amount: 3 } },
      ]);
      expect(u.runner.view.run?.step).toBe('continue');
    });

    it.each(SEEDS)('seed %i runner_at_access: Archives shows 2+ cards at once; Last run hidden during the run', (seed) => {
      const { plan, m } = play(seed, 'runner_at_access');
      const v = m.view('runner');
      expect(v.run!.step).toBe('access');
      expect(v.run!.access!.cards.length).toBe(Number(plan.info.count));
      expect(v.run!.access!.cards.length).toBeGreaterThanOrEqual(2);
      expect(v.run!.access!.cards.every((c) => c.cardId !== null)).toBe(true);
      expect(v.lastRun).toBeNull();
    });

    it.each(SEEDS)('seed %i runner_after_access: Last run lists the accessed cards for the Runner only, until the turn ends', (seed) => {
      const { plan, m } = play(seed, 'runner_after_access');
      const v = m.view('runner');
      expect(v.lastRun!.server).toBe('archives');
      expect(v.lastRun!.cards).toHaveLength(Number(plan.info.count));
      expect(v.lastRun!.cards.every((c) => c.from === 'archives')).toBe(true);
      expect(v.players.runner.clicks).toBeGreaterThanOrEqual(1);
      expect(m.view('corp').lastRun).toBeNull();
      const u = m.submit('runner', { type: 'end_turn', player: 'runner' });
      let last = u;
      if (last.runner.view.phase === 'discard') {
        const n = last.runner.view.pendingDiscard;
        last = m.submit('runner', { type: 'discard', player: 'runner', handIndices: Array.from({ length: n }, (_, i) => i) });
      }
      expect(last.runner.view.lastRun).toBeNull();
      expect(last.corp.view.lastRun).toBeNull();
    });
  });
});
