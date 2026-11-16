// Sprint 9 E7: the planToStep goals for the Sprint 9 e2e (core decks), played on through both seats in
// pass-the-phone and online games: traces, tags, Private Security Force, SEA Source, Ichi 1.0, Access to
// Globalsec. Each key move gives the same result on both phones and in both modes; nothing hidden leaks.
import { LocalMatch, type MatchUpdate } from '../src/index';
import { replay, type Action, type GameEvent, type GameOptions, type PlayerView, type Side } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { SPRINT8_GOALS, SPRINT9_GOALS, STEP_GOALS, goalDeckSet, planToStep, runnerEventLeaks, runnerViewLeaks, type StepGoal } from '../src/testing';

const MODES: [string, Partial<GameOptions>][] = [
  ['pass-the-phone', {}],
  ['online', { rezWindow: 'always' }],
];
const SEEDS = [1, 7, 42, 12345];
/** Seeds where ichi_two_programs also has Sacrificial Construct installed (pass-the-phone). */
const CONSTRUCT_SEEDS = [11, 16, 42];

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

/** Both seats get the same (public) events and agree on the public numbers. */
function both(u: MatchUpdate, f: (events: GameEvent[], view: PlayerView, side: Side) => void) {
  for (const side of ['corp', 'runner'] as const) f(u[side].events, u[side].view, side);
  // Same events on both phones (the owner alone sees its hand index).
  const strip = (events: GameEvent[]) => events.map((e) => ('handIndex' in e ? { ...e, handIndex: undefined } : e));
  expect(strip(u.runner.events)).toEqual(strip(u.corp.events));
}
const bid = (player: Side, credits: number): Action => ({ type: 'trace_bid', player, credits });
const pass = (player: Side): Action => ({ type: 'pass', player });

describe('Sprint 9 planToStep goals', () => {
  it('are core-deck goals separate from the earlier lists', () => {
    for (const g of SPRINT9_GOALS) {
      expect(STEP_GOALS).not.toContain(g);
      expect(SPRINT8_GOALS).not.toContain(g);
      expect(goalDeckSet(g)).toBe('core');
    }
  });

  it('work for seeds 1-100 and 12345, pass-the-phone and online', () => {
    for (const goal of SPRINT9_GOALS) {
      for (const seed of [...Array.from({ length: 100 }, (_, i) => i + 1), 12345]) {
        for (const [, options] of MODES) expect(() => planToStep(seed, goal, 1500, options), `${goal} ${seed}`).not.toThrow();
      }
    }
  }, 300_000);

  it('the plans replay with the engine', () => {
    for (const goal of SPRINT9_GOALS) {
      const p = planToStep(7, goal);
      const r = replay(7, p.actions, { deckSet: p.deckSet });
      expect(r.events.some((e) => e.type === 'action_rejected'), goal).toBe(false);
    }
  });

  describe.each(MODES)('%s', (_mode, options) => {
    it.each(SEEDS)('hunter_encounter (seed %i): S-09-1 AC1–AC3 — Corp bids 2, Runner sees "spend 4", bids 4: escaped', (seed) => {
      const { m } = setup(seed, 'hunter_encounter', options);
      const fire = ok(m, pass('runner'));
      both(fire, (events, view) => {
        expect(events.at(-1)).toEqual({ type: 'choice_opened', kind: 'trace_corp', player: 'corp', cardId: 'c20' });
        expect(view.choice?.trace).toMatchObject({ base: 3, strength: 3, link: 1 });
      });
      const corpBid = ok(m, bid('corp', 2));
      both(corpBid, (events, view) => {
        expect(events).toContainEqual({ type: 'trace_bid', player: 'corp', credits: 2, total: 5 });
        expect(view.choice).toMatchObject({ kind: 'trace_runner', waitingOn: 'runner', trace: { strength: 5, link: 1, needed: 4 } });
      });
      const runnerBefore = m.view('runner').players.runner.credits;
      const res = ok(m, bid('runner', 4));
      both(res, (events, view) => {
        expect(events).toContainEqual({ type: 'trace_resolved', cardId: 'c20', strength: 5, total: 5, success: false });
        expect(view.players.runner.credits).toBe(runnerBefore - 4);
        expect(view.players.runner.tags).toBe(0);
      });
    });

    it.each(SEEDS)('hunter_corp_broke (seed %i): S-09-1 AC6 — the Corp bids 0 at once (no Corp window)', (seed) => {
      const { m, info } = setup(seed, 'hunter_corp_broke', options);
      expect(info.corpCredits).toBe('0');
      const fire = ok(m, pass('runner'));
      both(fire, (events) => {
        expect(events).toContainEqual({ type: 'trace_bid', player: 'corp', credits: 0, total: 3, auto: true });
        expect(events.some((e) => e.type === 'choice_opened' && e.kind === 'trace_corp')).toBe(false);
        expect(events.at(-1)).toEqual({ type: 'choice_opened', kind: 'trace_runner', player: 'runner', cardId: 'c20' });
      });
    });

    it.each(SEEDS)('trace_tie (seed %i): S-09-1 AC4 — bidding exactly `needed` ties: no tag; one less: tagged', (seed) => {
      const a = setup(seed, 'trace_tie', options);
      const needed = Number(a.info.needed);
      both(ok(a.m, bid('runner', needed)), (events, view) => {
        expect(events).toContainEqual(expect.objectContaining({ type: 'trace_resolved', success: false }));
        expect(view.players.runner.tags).toBe(0);
      });
      const b = setup(seed, 'trace_tie', options);
      both(ok(b.m, bid('runner', needed - 1)), (events, view) => {
        expect(events).toContainEqual(expect.objectContaining({ type: 'trace_resolved', success: true }));
        expect(events).toContainEqual({ type: 'tags_changed', amount: 1, tags: 1 });
        expect(view.players.runner.tags).toBe(1);
      });
    });

    it.each(SEEDS)('runner_tagged_corp_turn (seed %i): S-09-2 AC2/AC6 — the Corp trashes Armitage Codebusting', (seed) => {
      const { m, info } = setup(seed, 'runner_tagged_corp_turn', options);
      const opt = m.view('corp').installedOptions[info.armitageUid!];
      expect(opt).toEqual([{ action: { type: 'trash_resource', player: 'corp', uid: info.armitageUid }, cost: 2, clicks: 1, reject: null }]);
      const u = ok(m, { type: 'trash_resource', player: 'corp', uid: info.armitageUid! });
      both(u, (events, view) => {
        expect(events).toContainEqual({ type: 'rig_card_trashed', uid: info.armitageUid, cardId: 'r02', cause: 'tagged' });
        expect(view.rig.some((c) => c.uid === info.armitageUid)).toBe(false);
        expect(view.players.runner.discard.at(-1)).toBe('r02');
        expect(view.players.runner.tags).toBe(Number(info.tags));
      });
    });

    it.each(SEEDS)('runner_tagged_own_turn (seed %i): S-09-2 AC4/AC6 — Remove 1 tag on both phones', (seed) => {
      const { m, info } = setup(seed, 'runner_tagged_own_turn', options);
      expect(m.view('runner').basicOptions).toEqual([{ action: { type: 'remove_tag', player: 'runner' }, cost: 2, clicks: 1, reject: null }]);
      const u = ok(m, { type: 'remove_tag', player: 'runner' });
      both(u, (events, view) => {
        expect(events).toContainEqual({ type: 'tags_changed', amount: -1, tags: Number(info.tags) - 1 });
        expect(view.players.runner.tags).toBe(Number(info.tags) - 1);
      });
    });

    it.each(SEEDS)('psf_scored_tagged (seed %i): S-09-3 AC1/AC5 — 1 meat damage; both see the same card face up in the Heap', (seed) => {
      const { m, info } = setup(seed, 'psf_scored_tagged', options);
      expect(m.view('corp').installedOptions[info.uid!]).toEqual([{ action: { type: 'activate', player: 'corp', uid: info.uid, ability: 0 }, cost: 0, clicks: 1, reject: null }]);
      const u = ok(m, { type: 'activate', player: 'corp', uid: info.uid!, ability: 0 });
      const dmg = u.corp.events.find((e) => e.type === 'meat_damage');
      expect(dmg).toMatchObject({ type: 'meat_damage', amount: 1 });
      const lost = dmg?.type === 'meat_damage' ? dmg.cardIds : [];
      both(u, (_events, view) => {
        if (info.grip === '0') expect(view.result).toEqual({ winner: 'corp', reason: 'flatline' });
        else expect(view.players.runner.discard.at(-1)).toBe(lost[0]);
      });
    });

    it.each(SEEDS)('ichi_two_programs (seed %i): S-09-4 AC1 — two Corp picks, then Trace 1', (seed) => {
      const { m, info } = setup(seed, 'ichi_two_programs', options);
      const programs = info.programs!.split(',');
      const fire = ok(m, pass('runner'));
      both(fire, (events) => expect(events.at(-1)).toEqual({ type: 'choice_opened', kind: 'trash_target', player: 'corp', cardId: 'c21' }));
      // Play every remaining decision with the first offered option until the ICE is done.
      const seen = new Set<string>();
      for (let k = 0; k < 12; k++) {
        const c = m.view('corp').choice;
        if (!c) break;
        const options = m.view(c.waitingOn).choice!.options;
        seen.add(c.kind);
        const a = options.find((o) => o.reject === null)!.action;
        ok(m, a);
      }
      expect(seen.has('trash_target')).toBe(true);
      if (info.construct) expect(seen.has('prevent_trash')).toBe(true);
      const after = m.view('runner');
      expect(after.rig.filter((c) => programs.includes(c.uid)).length).toBeLessThan(programs.length);
      // The trace ran (subroutine 2 reported).
      const all = replay(m.seed, m.actions(), m.options).events;
      expect(all.some((e) => e.type === 'subroutine_resolved' && e.cardId === 'c21' && e.outcome.op === 'trace')).toBe(true);
    });

    it.each(SEEDS)('sea_source_ready / not_ready (seed %i): S-09-4 AC2/AC3', (seed) => {
      const ready = setup(seed, 'sea_source_ready', options);
      const play: Action = { type: 'play', player: 'corp', handIndex: Number(ready.info.handIndex) };
      expect(ready.m.view('corp').handOptions[Number(ready.info.handIndex)]).toEqual([{ action: play, cost: 2, reject: null }]);
      both(ok(ready.m, play), (events) => {
        expect(events).toContainEqual({ type: 'trace_started', cardId: 'c22', base: 3, link: expect.any(Number) });
      });
      const notReady = setup(seed, 'sea_source_not_ready', options);
      const i = Number(notReady.info.handIndex);
      expect(notReady.m.view('corp').handOptions[i]).toEqual([{ action: { type: 'play', player: 'corp', handIndex: i }, cost: 2, reject: 'condition_not_met' }]);
    });

    it.each(SEEDS)('globalsec_installed / two (seed %i): S-09-4 AC4 — link 2 / 3 on both phones, used by the next trace', (seed) => {
      for (const [goal, link] of [['globalsec_installed', 2], ['globalsec_two_installed', 3]] as const) {
        const { m, info } = setup(seed, goal, options);
        expect(info.link).toBe(String(link));
        for (const side of ['corp', 'runner'] as const) expect(m.view(side).players.runner.link).toBe(link);
        // Run Hunter: the trace starts with that link.
        const u = m.submit('runner', { type: 'run', player: 'runner', server: info.hunterServer as `remote${number}` });
        expect(u.runner.events.some((e) => e.type === 'action_rejected')).toBe(false);
        for (let k = 0; k < 10; k++) {
          const v = m.view('corp').run?.waitingOn === 'corp' || m.view('corp').choice?.waitingOn === 'corp' ? m.view('corp') : m.view('runner');
          const events = replay(m.seed, m.actions(), m.options).events;
          const started = events.filter((e) => e.type === 'trace_started').at(-1);
          if (started) {
            expect(started).toMatchObject({ cardId: 'c20', link });
            break;
          }
          const a = (v.choice?.options ?? v.run?.options ?? []).find((o) => o.reject === null && (o.action.type === 'rez' || o.action.type === 'pass' || o.action.type === 'trace_bid'))?.action;
          if (!a) break;
          ok(m, a);
        }
        expect(replay(m.seed, m.actions(), m.options).events.some((e) => e.type === 'trace_started')).toBe(true);
      }
    });
  });

  it.each(CONSTRUCT_SEEDS)('ichi_two_programs with Sacrificial Construct (seed %i)', (seed) => {
    expect(setup(seed, 'ichi_two_programs', {}).info.construct).not.toBe('');
  });
});
