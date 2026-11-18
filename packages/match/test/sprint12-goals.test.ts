// Sprint 12 E5: planToStep goals on the 45-card decks for the S-12-1…S-12-5 e2e (SPRINT12_GOALS), in
// pass-the-phone and online games. Each test plays the plan through a LocalMatch, checks the goal's
// situation and `info`, makes the key move, and checks the Runner's projection is clean.
import { LocalMatch, type MatchUpdate } from '../src/index';
import { replay, type Action, type GameOptions } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import {
  SPRINT10_GOALS,
  SPRINT11_GOALS,
  SPRINT12_GOALS,
  SPRINT7_GOALS,
  SPRINT8_GOALS,
  SPRINT9_GOALS,
  STEP_GOALS,
  goalDeckSet,
  planToStep,
  runnerEventLeaks,
  runnerViewLeaks,
  type StepGoal,
} from '../src/testing';

const MODES: [string, Partial<GameOptions>][] = [
  ['pass-the-phone', {}],
  ['online', { rezWindow: 'always' }],
];
/** Pinned seeds per goal (the extras and the no-ICE look do not work on every seed: see the README). */
const SEEDS: Record<string, number[]> = {
  abt_scorable: [1, 7, 42, 12345],
  abt_scorable_no_ice: [1, 7, 42, 99],
  archived_memories_ready: [1, 7, 42, 12345],
  archived_memories_empty: [1, 7, 12345],
  experiential_data_encounter: [1, 7, 42, 12345],
  toolbox_encounter: [1, 7, 42, 12345],
  modded_ready: [1, 7, 42, 12345],
  modded_no_target: [1, 7, 42, 12345],
  infiltration_ready: [1, 7, 42, 12345],
};
/** The seven goals of the tech plan: every seed of 1-40 works (except no-ICE on short-R&D seeds, none in 1-40). */
const PLANNED: StepGoal[] = [
  'abt_scorable',
  'abt_scorable_no_ice',
  'archived_memories_ready',
  'experiential_data_encounter',
  'toolbox_encounter',
  'modded_ready',
  'infiltration_ready',
];

function setup(seed: number, goal: StepGoal, options: Partial<GameOptions>) {
  const plan = planToStep(seed, goal, 1500, options);
  expect(plan.deckSet).toBe('core45');
  const m = new LocalMatch(seed, { ...options, deckSet: plan.deckSet });
  for (const a of plan.actions) expect(m.submit(a.player, a)[a.player].events.some((e) => e.type === 'action_rejected')).toBe(false);
  const state = replay(seed, m.actions(), m.options).state;
  expect(runnerViewLeaks(state, m.view('runner'))).toEqual([]);
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

describe('Sprint 12 planToStep goals (45-card decks)', () => {
  it('are their own list, planned on core45', () => {
    expect([...SPRINT12_GOALS].sort()).toEqual([...PLANNED, 'archived_memories_empty', 'modded_no_target'].sort());
    for (const list of [STEP_GOALS, SPRINT7_GOALS, SPRINT8_GOALS, SPRINT9_GOALS, SPRINT10_GOALS, SPRINT11_GOALS]) {
      for (const g of SPRINT12_GOALS) expect(list).not.toContain(g);
    }
    for (const g of SPRINT12_GOALS) expect(goalDeckSet(g)).toBe('core45');
    expect(goalDeckSet('ice_wall_ram_gordian')).toBe('core');
  });

  it('the seven planned goals work for seeds 1-40, pass-the-phone and online; plans replay', () => {
    for (const goal of PLANNED) {
      for (let seed = 1; seed <= 40; seed++) {
        for (const [, options] of MODES) {
          const p = planToStep(seed, goal, 1500, options);
          expect(replay(seed, p.actions, { ...options, deckSet: p.deckSet }).events.some((e) => e.type === 'action_rejected'), `${goal} ${seed}`).toBe(false);
        }
      }
    }
  }, 120_000);

  describe.each(MODES)('%s', (_mode, options) => {
    it.each(SEEDS.abt_scorable!)('abt_scorable (seed %i): Score opens the look with ICE to place; the Runner sees only the count', (seed) => {
      const { m, info } = setup(seed, 'abt_scorable', options);
      expect(Number(info.ice)).toBeGreaterThanOrEqual(1);
      const u = ok(m, { type: 'score', player: 'corp', uid: info.uid! });
      const corp = u.corp.view.choice!;
      expect(corp.kind).toBe('look_install');
      expect(corp.looked).toHaveLength(Number(info.looked));
      expect(corp.options.some((o) => o.action.type === 'select')).toBe(true);
      expect(u.runner.view.choice!.looked).toEqual(Array(Number(info.looked)).fill(null));
      expect(u.runner.events).toContainEqual({ type: 'cards_looked_at', count: Number(info.looked) });
      const sel = corp.options.find((o) => o.action.type === 'select' && o.action.server === 'new')!;
      const v = ok(m, sel.action);
      expect(v.runner.events.some((e) => e.type === 'ice_rezzed')).toBe(true);
    });

    it.each(SEEDS.abt_scorable_no_ice!)('abt_scorable_no_ice (seed %i): Score shows 3 cards, Done is the only option, one tap trashes them face down', (seed) => {
      const { m, info } = setup(seed, 'abt_scorable_no_ice', options);
      expect(info).toMatchObject({ looked: '3', ice: '0' });
      const u = ok(m, { type: 'score', player: 'corp', uid: info.uid! });
      expect(u.corp.view.choice!.options.map((o) => o.action)).toEqual([{ type: 'pass', player: 'corp' }]);
      const before = u.runner.view.players.corp.discardCount;
      const d = ok(m, { type: 'pass', player: 'corp' });
      expect(d.runner.events).toContainEqual({ type: 'rd_cards_trashed', count: 3 });
      expect(d.runner.view.players.corp.discard.slice(before)).toEqual([null, null, null]);
    });

    it.each(SEEDS.archived_memories_ready!)('archived_memories_ready (seed %i): play, pick the face-down card; the Runner learns no id', (seed) => {
      const { m, info } = setup(seed, 'archived_memories_ready', options);
      const play: Action = { type: 'play', player: 'corp', handIndex: Number(info.handIndex) };
      const u = ok(m, play);
      expect(u.corp.view.choice!.kind).toBe('archives_pick');
      const pick: Action = { type: 'select', player: 'corp', card: Number(info.faceDownIndex) };
      expect(u.corp.view.choice!.options.map((o) => o.action)).toContainEqual(pick);
      expect(u.corp.view.choice!.options).toHaveLength(Number(info.archives));
      const r = ok(m, pick);
      const back = r.runner.events.find((e) => e.type === 'card_returned_to_hand');
      expect(back).toEqual({ type: 'card_returned_to_hand', player: 'corp', archivesIndex: Number(info.faceDownIndex), faceUp: false });
    });

    it.each(SEEDS.archived_memories_empty!)('archived_memories_empty (seed %i): dimmed, condition_not_met', (seed) => {
      const { m, info } = setup(seed, 'archived_memories_empty', options);
      const v = m.view('corp');
      expect(v.players.corp.discardCount).toBe(0);
      expect(v.handOptions[Number(info.handIndex)]).toEqual([{ action: { type: 'play', player: 'corp', handIndex: Number(info.handIndex) }, cost: 0, reject: 'condition_not_met' }]);
    });

    it.each(SEEDS.experiential_data_encounter!)('experiential_data_encounter (seed %i): Enigma shows 3 on both phones; Gordian Blade must pump first', (seed) => {
      const { m, info } = setup(seed, 'experiential_data_encounter', options);
      expect(info).toMatchObject({ iceStrength: '3', printedStrength: '2' });
      for (const side of ['corp', 'runner'] as const) {
        const v = m.view(side);
        expect(v.run!.ice!.strength).toBe(3);
        expect(v.corpServers.find((sv) => sv.id === info.server)!.ice[0]!.strength).toBe(3);
      }
      const brk = m.view('runner').run!.options.find((o) => o.action.type === 'use_ability' && o.action.uid === info.breakerUid && o.action.ability === 0)!;
      expect(brk.reject).toBe('too_weak');
      ok(m, { type: 'use_ability', player: 'runner', uid: info.breakerUid!, ability: 1 });
      ok(m, { type: 'use_ability', player: 'runner', uid: info.breakerUid!, ability: 0, sub: 0 });
    });

    it.each(SEEDS.toolbox_encounter!)('toolbox_encounter (seed %i): the breaker is paid from The Toolbox first', (seed) => {
      const { m, info } = setup(seed, 'toolbox_encounter', options);
      const opts = m.view('runner').run!.options.filter((o) => o.action.type === 'use_ability' && o.action.uid === info.breakerUid);
      expect(opts.length).toBeGreaterThan(0);
      for (const o of opts) expect(o.hostedPay?.[0]?.uid).toBe(info.toolboxUid);
      const u = ok(m, opts[0]!.action);
      expect(u.runner.events).toContainEqual(expect.objectContaining({ type: 'hosted_credits_changed', uid: info.toolboxUid }));
    });

    it.each(SEEDS.modded_ready!)('modded_ready (seed %i): the offered install goes in at its price, no extra click', (seed) => {
      const { m, info } = setup(seed, 'modded_ready', options);
      const before = m.view('runner').players.runner;
      expect(Number(info.discount)).toBeGreaterThan(0);
      const u = ok(m, { type: 'play', player: 'runner', handIndex: Number(info.handIndex), installIndex: Number(info.installIndex) });
      expect(u.runner.view.players.runner.clicks).toBe(before.clicks - 1);
      expect(u.runner.view.players.runner.credits).toBe(before.credits - Number(info.cost));
      expect(u.corp.events).toContainEqual(expect.objectContaining({ type: 'card_installed', player: 'runner', cardId: info.cardId }));
    });

    it.each(SEEDS.modded_no_target!)('modded_no_target (seed %i): dimmed, condition_not_met', (seed) => {
      const { m, info } = setup(seed, 'modded_no_target', options);
      expect(m.view('runner').handOptions[Number(info.handIndex)]).toEqual([
        { action: { type: 'play', player: 'runner', handIndex: Number(info.handIndex) }, cost: 0, reject: 'condition_not_met' },
      ]);
    });

    it.each(SEEDS.infiltration_ready!)('infiltration_ready (seed %i): Expose shows the card on both phones; it stays face down', (seed) => {
      const { m, info } = setup(seed, 'infiltration_ready', options);
      const u = ok(m, { type: 'play', player: 'runner', handIndex: Number(info.handIndex), mode: 1, uid: info.uid! });
      const exposed = { type: 'card_exposed', uid: info.uid, cardId: info.cardId, server: info.server };
      expect(u.runner.events).toContainEqual(exposed);
      expect(u.corp.events).toContainEqual(exposed);
      const c = u.runner.view.corpServers.flatMap((sv) => [...sv.ice, ...sv.content]).find((x) => x.uid === info.uid)!;
      expect(c).toMatchObject({ cardId: null, faceUp: false });
    });
  });
});
