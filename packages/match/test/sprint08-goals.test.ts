// Sprint 8 E8: the planToStep goals for the Sprint 8 e2e (core decks), played on through both
// seats in pass-the-phone and online games: each story's key move gives the same result on both
// phones and in both modes, and the Runner seat never sees a hidden card.
import { LocalMatch, type MatchUpdate } from '../src/index';
import { replay, type Action, type GameEvent, type GameOptions, type PlayerView, type Side } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { SPRINT8_GOALS, STEP_GOALS, goalDeckSet, planToStep, runnerEventLeaks, runnerViewLeaks, type StepGoal } from '../src/testing';

const MODES: [string, Partial<GameOptions>][] = [
  ['pass-the-phone', {}],
  ['online', { rezWindow: 'always' }],
];
const SEEDS = [1, 7, 42, 12345];
/** Seeds where rototurret_two_programs also has Sacrificial Construct installed. */
const CONSTRUCT_SEEDS = [2, 6, 7, 12345];

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

const both = (u: MatchUpdate, f: (events: GameEvent[], view: PlayerView, side: Side) => void) => {
  for (const side of ['corp', 'runner'] as const) f(u[side].events, u[side].view, side);
};
const types = (events: readonly GameEvent[]) => events.map((e) => e.type);
const pass = (player: Side): Action => ({ type: 'pass', player });

describe('Sprint 8 planToStep goals', () => {
  it('are separate from the legacy STEP_GOALS and plan on the core decks', () => {
    for (const g of SPRINT8_GOALS) {
      expect(STEP_GOALS).not.toContain(g);
      expect(goalDeckSet(g)).toBe('core');
    }
    for (const g of STEP_GOALS) expect(goalDeckSet(g)).toBe('starter');
  });

  it('work for seeds 1-100 and 12345, pass-the-phone and online', () => {
    for (const goal of SPRINT8_GOALS) {
      for (const seed of [...Array.from({ length: 100 }, (_, i) => i + 1), 12345]) {
        for (const [, options] of MODES) expect(() => planToStep(seed, goal, 1500, options), `${goal} ${seed}`).not.toThrow();
      }
    }
  }, 300_000);

  it('the plans replay with the engine on the plan deck set', () => {
    for (const goal of SPRINT8_GOALS) {
      const p = planToStep(7, goal);
      const r = replay(7, p.actions, { deckSet: p.deckSet });
      expect(r.events.some((e) => e.type === 'action_rejected'), goal).toBe(false);
    }
  });

  describe.each(MODES)('%s', (_mode, options) => {
    it.each(SEEDS)('corp_first_install (seed %i): +1 credit with "Engineering the Future" on both phones', (seed) => {
      const { m, info } = setup(seed, 'corp_first_install', options);
      const before = m.view('corp').players.corp.credits;
      const u = ok(m, { type: 'install', player: 'corp', handIndex: Number(info.handIndex), server: 'new' });
      both(u, (events, view) => {
        expect(events).toContainEqual({ type: 'ability_triggered', uid: 'id:corp', cardId: 'c13', trigger: 'install' });
        expect(events).toContainEqual({ type: 'credit_gained', player: 'corp', amount: 1 });
        expect(view.players.corp.credits).toBe(before + 1);
      });
    });

    it.each(SEEDS)('runner_kate_discount (seed %i): a resource first, then Corroder at 1', (seed) => {
      const { m, info } = setup(seed, 'runner_kate_discount', options);
      const opt = m.view('runner').handOptions[Number(info.corroderIndex)]![0]!;
      expect(opt).toMatchObject({ cost: 1, discount: 1, reject: null });
      ok(m, { type: 'install', player: 'runner', handIndex: Number(info.resourceIndex) });
      const hand = m.view('runner').players.runner.hand!;
      const before = m.view('runner').players.runner.credits;
      const u = ok(m, { type: 'install', player: 'runner', handIndex: hand.indexOf('r04') });
      both(u, (events, view) => {
        expect(events[0]).toEqual({ type: 'ability_triggered', uid: 'id:runner', cardId: 'r13', trigger: 'install_discount' });
        expect(events).toContainEqual({ type: 'credits_spent', player: 'runner', amount: 1 });
        expect(view.players.runner.credits).toBe(before - 1);
      });
    });

    it.each(SEEDS)('corp_rez_adonis + adonis_before_corp_turn (seed %i): 12 credits on it, then +3 at the Corp turn start', (seed) => {
      const a = setup(seed, 'corp_rez_adonis', options);
      const u = ok(a.m, { type: 'rez', player: 'corp', uid: a.info.uid! });
      both(u, (events, view) => {
        expect(events).toContainEqual({ type: 'hosted_credits_changed', uid: a.info.uid, credits: 12 });
        expect(view.corpServers.flatMap((sv) => sv.content).find((c) => c.uid === a.info.uid)).toMatchObject({ cardId: 'c14', faceUp: true, hostedCredits: 12 });
      });
      const b = setup(seed, 'adonis_before_corp_turn', options);
      const corpBefore = b.m.view('corp').players.corp.credits;
      const end = ok(b.m, { type: 'end_turn', player: 'runner' });
      both(end, (events, view) => {
        const at = events.findIndex((e) => e.type === 'turn_started' && e.player === 'corp');
        expect(events.slice(at + 1, at + 4)).toEqual([
          { type: 'ability_triggered', uid: b.info.uid, cardId: 'c14', trigger: 'turn_start' },
          { type: 'hosted_credits_changed', uid: b.info.uid, credits: Number(b.info.credits) - 3 },
          { type: 'credit_gained', player: 'corp', amount: 3 },
        ]);
        expect(view.players.corp.credits).toBe(corpBefore + 3);
      });
    });

    it.each(SEEDS)('corp_melange (seed %i): 3 clicks → 7 credits on both phones', (seed) => {
      const { m, info } = setup(seed, 'corp_melange', options);
      expect(m.view('corp').installedOptions[info.uid!]).toEqual([
        { action: { type: 'activate', player: 'corp', uid: info.uid, ability: 0 }, cost: 0, reject: null, clicks: 3, gain: 7 },
      ]);
      const before = m.view('corp').players.corp.credits;
      const u = ok(m, { type: 'activate', player: 'corp', uid: info.uid!, ability: 0 });
      both(u, (_e, view) => {
        expect(view.players.corp.credits).toBe(before + 7);
        expect(view.players.corp.clicks).toBe(0);
      });
    });

    it.each(SEEDS)('corp_biotic_labor (seed %i): 3 → 2 → 4 clicks on both phones', (seed) => {
      const { m, info } = setup(seed, 'corp_biotic_labor', options);
      const u = ok(m, { type: 'play', player: 'corp', handIndex: Number(info.handIndex) });
      both(u, (events, view) => {
        expect(events).toContainEqual({ type: 'clicks_gained', player: 'corp', amount: 2 });
        expect(view.players.corp.clicks).toBe(4);
      });
    });

    it.each(SEEDS)('viktor_encounter (seed %i): brain damage — the same lost card and hand max 4 on both phones', (seed) => {
      const { m } = setup(seed, 'viktor_encounter', options);
      const u = ok(m, pass('runner'));
      const lost = (u.runner.events.find((e) => e.type === 'brain_damage') as Extract<GameEvent, { type: 'brain_damage' }>).cardIds;
      expect(lost).toHaveLength(1);
      both(u, (events, view) => {
        expect(events).toContainEqual({ type: 'brain_damage', amount: 1, cardIds: lost, maxHandSize: 4 });
        expect(events.at(-1)).toMatchObject({ type: 'run_ended', outcome: 'ended_by_ice' });
        expect(view.players.runner.maxHandSize).toBe(4);
        expect(view.players.runner.discard.at(-1)).toBe(lost[0]);
      });
    });

    it.each(SEEDS)('heimdall_corroder_encounter (seed %i): +4 strength before any break', (seed) => {
      const { m, info } = setup(seed, 'heimdall_corroder_encounter', options);
      const v = m.view('runner').run!;
      expect(v.ice).toMatchObject({ cardId: 'c18', strength: 6 });
      expect(v.breakerStrength[info.breakerUid!]).toBe(2);
      expect(v.options.filter((o) => o.action.type === 'use_ability' && o.action.ability === 0).every((o) => o.reject === 'too_weak')).toBe(true);
      for (let k = 0; k < 4; k++) ok(m, { type: 'use_ability', player: 'runner', uid: info.breakerUid!, ability: 1 });
      expect(m.view('corp').run!.breakerStrength[info.breakerUid!]).toBe(6);
    });

    it.each(SEEDS)('heimdall_ram_encounter (seed %i): Battering Ram breaks 2 at once, the same on both phones', (seed) => {
      const { m, info } = setup(seed, 'heimdall_ram_encounter', options);
      const ram = info.breakerUid!;
      for (let k = 0; k < 3; k++) ok(m, { type: 'use_ability', player: 'runner', uid: ram, ability: 1 });
      const picks = m.view('runner').run!.options.filter((o) => o.action.type === 'use_ability' && o.action.ability === 0);
      expect(picks).toHaveLength(6);
      const u = ok(m, { type: 'use_ability', player: 'runner', uid: ram, ability: 0, subs: [1, 2] });
      both(u, (events, view) => {
        expect(events).toEqual([
          { type: 'credits_spent', player: 'runner', amount: 2 },
          { type: 'subroutine_broken', iceUid: info.iceUid, sub: 1, breakerUid: ram },
          { type: 'subroutine_broken', iceUid: info.iceUid, sub: 2, breakerUid: ram },
        ]);
        expect(view.run!.ice!.subroutines.map((x) => x.broken)).toEqual([false, true, true]);
      });
    });

    it.each(SEEDS)('pipeline_katana_encounter (seed %i): 2 + 2 for strength 3, then 1 to break', (seed) => {
      const { m, info } = setup(seed, 'pipeline_katana_encounter', options);
      const p = info.breakerUid!;
      ok(m, { type: 'use_ability', player: 'runner', uid: p, ability: 1 });
      ok(m, { type: 'use_ability', player: 'runner', uid: p, ability: 1 });
      const u = ok(m, { type: 'use_ability', player: 'runner', uid: p, ability: 0, sub: 0 });
      both(u, (events) => expect(types(events)).toEqual(['credits_spent', 'subroutine_broken', 'ice_passed']));
    });

    it.each(SEEDS)('runner_magnum_opus / runner_sure_gamble (seed %i)', (seed) => {
      const mo = setup(seed, 'runner_magnum_opus', options);
      const before = mo.m.view('runner').players.runner.credits;
      const u = ok(mo.m, { type: 'activate', player: 'runner', uid: mo.info.uid!, ability: 0 });
      both(u, (_e, view) => expect(view.players.runner.credits).toBe(before + 2));
      const sg = setup(seed, 'runner_sure_gamble', options);
      const g = ok(sg.m, { type: 'play', player: 'runner', handIndex: Number(sg.info.handIndex) });
      both(g, (_e, view) => expect(view.players.runner.credits).toBe(9));
    });

    it.each(SEEDS)('rototurret_two_programs (seed %i): the Corp picks a program mid-run; both phones agree', (seed) => {
      const { m, info } = setup(seed, 'rototurret_two_programs', options);
      const programs = info.programs!.split(',');
      expect(programs.length).toBeGreaterThanOrEqual(2);
      const fire = ok(m, pass('runner'));
      both(fire, (events, view) => {
        expect(events.at(-1)).toEqual({ type: 'choice_opened', kind: 'trash_target', player: 'corp', cardId: 'c19' });
        expect(view.choice).toMatchObject({ kind: 'trash_target', waitingOn: 'corp' });
        expect(view.run).not.toBeNull();
      });
      expect(fire.corp.view.choice!.options.map((o) => o.action)).toEqual(programs.map((uid) => ({ type: 'choose', player: 'corp', uid })));
      const target = programs[0]!;
      const picked = ok(m, { type: 'choose', player: 'corp', uid: target });
      if (info.construct) {
        both(picked, (events) => expect(events.at(-1)).toEqual({ type: 'choice_opened', kind: 'prevent_trash', player: 'runner', cardId: 'c19', target }));
        const saved = ok(m, { type: 'choose', player: 'runner', uid: info.construct });
        both(saved, (events, view) => {
          expect(events).toContainEqual({ type: 'trash_prevented', uid: target, cardId: expect.any(String), byUid: info.construct, byCardId: 'r12' });
          expect(view.rig.some((c) => c.uid === target)).toBe(true);
          expect(view.run).toBeNull();
        });
      } else {
        both(picked, (events, view) => {
          expect(events).toContainEqual(expect.objectContaining({ type: 'rig_card_trashed', uid: target }));
          expect(events).toContainEqual(expect.objectContaining({ type: 'subroutine_resolved', outcome: { sub: 0, op: 'trash_installed', amount: 1 } }));
          expect(view.rig.some((c) => c.uid === target)).toBe(false);
        });
      }
    });

    it.each(CONSTRUCT_SEEDS)('rototurret_two_programs with Sacrificial Construct (seed %i): declining lets it be trashed', (seed) => {
      const { m, info } = setup(seed, 'rototurret_two_programs', options);
      expect(info.construct).not.toBe('');
      ok(m, pass('runner'));
      const target = info.programs!.split(',')[1]!;
      ok(m, { type: 'choose', player: 'corp', uid: target });
      const u = ok(m, pass('runner'));
      both(u, (events, view) => {
        expect(events[0]).toEqual({ type: 'choice_closed', kind: 'prevent_trash', skipped: true });
        expect(view.rig.some((c) => c.uid === target)).toBe(false);
        expect(view.rig.some((c) => c.uid === info.construct)).toBe(true);
      });
    });
  });

  it('the hot-seat and online results match (same event types) for the key moves', () => {
    const key: [StepGoal, (info: Record<string, string>) => Action][] = [
      ['viktor_encounter', () => pass('runner')],
      ['corp_melange', (i) => ({ type: 'activate', player: 'corp', uid: i.uid!, ability: 0 })],
      ['runner_sure_gamble', (i) => ({ type: 'play', player: 'runner', handIndex: Number(i.handIndex) })],
    ];
    for (const [goal, move] of key) {
      const a = setup(42, goal, {});
      const b = setup(42, goal, { rezWindow: 'always' });
      const ua = ok(a.m, move(a.info));
      const ub = ok(b.m, move(b.info));
      expect(types(ub.corp.events), goal).toEqual(types(ua.corp.events));
    }
  });
});
