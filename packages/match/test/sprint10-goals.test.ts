// Sprint 10 E4: the planToStep goals for the Sprint 10 e2e (core decks), played on through both seats in
// pass-the-phone and online games: the advance cap, scored piles (PSF from the pile), the stats column
// (tagged, link 2, full rig), a remote's lane folding away, and both discard steps.
import { LocalMatch, type MatchUpdate } from '../src/index';
import { replay, type Action, type GameOptions, type ServerId, type Side } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { SPRINT10_GOALS, SPRINT8_GOALS, SPRINT9_GOALS, STEP_GOALS, goalDeckSet, planToStep, runnerEventLeaks, runnerViewLeaks, type StepGoal } from '../src/testing';

const MODES: [string, Partial<GameOptions>][] = [
  ['pass-the-phone', {}],
  ['online', { rezWindow: 'always' }],
];
const SEEDS = [1, 7, 42, 12345];

function setup(seed: number, goal: StepGoal, options: Partial<GameOptions>) {
  const plan = planToStep(seed, goal, 1500, options);
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

/** A refused move: only the sender hears it. */
function refused(m: LocalMatch, a: Action): string | undefined {
  const u = m.submit(a.player, a);
  const other: Side = a.player === 'corp' ? 'runner' : 'corp';
  expect(u[other].events).toEqual([]);
  const e = u[a.player].events.find((x) => x.type === 'action_rejected');
  return e?.type === 'action_rejected' ? e.reason : undefined;
}

describe('Sprint 10 planToStep goals', () => {
  it('are core-deck goals separate from the earlier lists', () => {
    for (const g of SPRINT10_GOALS) {
      expect(STEP_GOALS).not.toContain(g);
      expect(SPRINT8_GOALS).not.toContain(g);
      expect(SPRINT9_GOALS).not.toContain(g);
      expect(goalDeckSet(g)).toBe('core');
    }
  });

  it('work for seeds 1-100 and 12345, pass-the-phone and online', () => {
    for (const goal of SPRINT10_GOALS) {
      for (const seed of [...Array.from({ length: 100 }, (_, i) => i + 1), 12345]) {
        for (const [, options] of MODES) expect(() => planToStep(seed, goal, 1500, options), `${goal} ${seed}`).not.toThrow();
      }
    }
  }, 300_000);

  it('the plans replay with the engine', () => {
    for (const goal of SPRINT10_GOALS) {
      const p = planToStep(7, goal);
      const r = replay(7, p.actions, { deckSet: p.deckSet });
      expect(r.events.some((e) => e.type === 'action_rejected'), goal).toBe(false);
    }
  });

  describe.each(MODES)('%s', (_mode, options) => {
    it.each(SEEDS)('agenda_at_requirement (seed %i): only Score on both counts; Advance refused on the Corp’s seat only', (seed) => {
      const { m, info } = setup(seed, 'agenda_at_requirement', options);
      const v = m.view('corp');
      expect(v.installedOptions[info.uid!]!.map((o) => o.action.type)).toEqual(['score']);
      expect(v.legalActions).not.toContainEqual({ type: 'advance', player: 'corp', uid: info.uid });
      expect(refused(m, { type: 'advance', player: 'corp', uid: info.uid! })).toBe('condition_not_met');
      const u = ok(m, { type: 'score', player: 'corp', uid: info.uid! });
      for (const side of ['corp', 'runner'] as const) expect(u[side].events.map((e) => e.type)).toContain('agenda_scored');
    });

    it.each(SEEDS)('agenda_one_short (seed %i): Advance once, then only Score', (seed) => {
      const { m, info } = setup(seed, 'agenda_one_short', options);
      expect(m.view('corp').installedOptions[info.uid!]!.map((o) => o.action.type)).toEqual(['advance']);
      ok(m, { type: 'advance', player: 'corp', uid: info.uid! });
      expect(m.view('corp').installedOptions[info.uid!]!.map((o) => o.action.type)).toEqual(['score']);
    });

    it.each(SEEDS)('ice_wall_advanced (seed %i): Advance still offered and accepted', (seed) => {
      const { m, info } = setup(seed, 'ice_wall_advanced', options);
      expect(m.view('corp').installedOptions[info.uid!]).toContainEqual({ action: { type: 'advance', player: 'corp', uid: info.uid }, cost: 1, reject: null });
      const u = ok(m, { type: 'advance', player: 'corp', uid: info.uid! });
      for (const side of ['corp', 'runner'] as const) {
        expect(u[side].events.at(-1)).toEqual({ type: 'card_advanced', uid: info.uid, advancements: Number(info.advancements) + 1 });
      }
    });

    it.each(SEEDS)('corp_two_scored (seed %i): ≥ 2 scored incl. PSF, same on both; its option is listed under the scored uid', (seed) => {
      const { m, info } = setup(seed, 'corp_two_scored', options);
      for (const side of ['corp', 'runner'] as const) {
        const cp = m.view(side).players.corp;
        expect(cp.scored.join(',')).toBe(info.scored);
        expect(cp.points).toBe(Number(info.points));
        expect(cp.points).toBeLessThan(7);
      }
      expect(m.view('corp').installedOptions[info.psfUid!]).toEqual([
        { action: { type: 'activate', player: 'corp', uid: info.psfUid, ability: 0 }, cost: 0, reject: m.view('corp').players.runner.tags > 0 ? null : 'condition_not_met', clicks: 1 },
      ]);
    });

    it.each(SEEDS)('runner_two_stolen (seed %i): ≥ 2 stolen, under 7 points, same on both', (seed) => {
      const { m, info } = setup(seed, 'runner_two_stolen', options);
      expect(Number(info.count)).toBeGreaterThanOrEqual(2);
      for (const side of ['corp', 'runner'] as const) {
        expect(m.view(side).players.runner.scored.join(',')).toBe(info.scored);
        expect(m.view(side).players.runner.points).toBeLessThan(7);
      }
    });

    it.each(SEEDS)('psf_installed_unscored (seed %i): Advance only; no PSF ability offered for it', (seed) => {
      const { m, info } = setup(seed, 'psf_installed_unscored', options);
      expect(m.view('corp').installedOptions[info.uid!]!.map((o) => o.action.type)).toEqual(['advance']);
      expect(m.view('corp').players.corp.scored).not.toContain('c09');
    });

    it.each(SEEDS)('runner_tagged_full_rig (seed %i): tagged, ≥ 4 rig cards, one Globalsec, link 2 on both', (seed) => {
      const { m, info } = setup(seed, 'runner_tagged_full_rig', options);
      expect(Number(info.rig)).toBeGreaterThanOrEqual(4);
      for (const side of ['corp', 'runner'] as const) {
        const rp = m.view(side).players.runner;
        expect(rp.tags).toBeGreaterThanOrEqual(1);
        expect(rp.link).toBe(2);
        expect(m.view(side).rig.length).toBe(Number(info.rig));
      }
      expect(m.view('runner').basicOptions.map((o) => o.action.type)).toEqual(['remove_tag']);
    });

    it.each(SEEDS)('remote_single_card_no_ice (seed %i): taking the card folds that remote; the others keep their ids and order', (seed) => {
      const { m, info } = setup(seed, 'remote_single_card_no_ice', options);
      const before = m.view('runner').corpServers.map((s) => s.id);
      expect(before.slice(0, 3)).toEqual(['hq', 'rd', 'archives']);
      expect(before.indexOf(info.server as ServerId)).toBeLessThan(before.indexOf(info.otherServer as ServerId));
      ok(m, { type: 'run', player: 'runner', server: info.server as ServerId });
      const runV = m.view('runner').run!;
      const take = runV.options.find((o) => o.action.type === (info.kind === 'steal' ? 'steal' : 'trash'))!;
      expect(take.reject).toBeNull();
      let u = ok(m, take.action);
      if (m.view('runner').run) u = ok(m, { type: 'pass', player: 'runner' });
      const after = before.filter((id) => id !== info.server);
      for (const side of ['corp', 'runner'] as const) {
        expect(u[side].events).toContainEqual({ type: 'server_removed', server: info.server });
        expect(m.view(side).corpServers.map((s) => s.id)).toEqual(after);
      }
      if (info.kind === 'trash') expect(m.view('runner').players.corp.discard.at(-1)).toBe(info.cardId);
    });

    it.each(SEEDS)('runner_must_discard / corp_must_discard (seed %i): the discard step with the engine count', (seed) => {
      for (const [goal, side] of [['runner_must_discard', 'runner'], ['corp_must_discard', 'corp']] as const) {
        const { m, info } = setup(seed, goal, options);
        const v = m.view(side);
        expect(v.phase).toBe('discard');
        expect(v.pendingDiscard).toBe(Number(info.count));
        expect(v.players[side].handCount).toBe(Number(info.hand));
        const handIndices = Array.from({ length: v.pendingDiscard }, (_, i) => i);
        const u = ok(m, { type: 'discard', player: side, handIndices });
        expect(u[side].view.players[side].handCount).toBe(Number(info.hand) - Number(info.count));
      }
    });
  });
});
