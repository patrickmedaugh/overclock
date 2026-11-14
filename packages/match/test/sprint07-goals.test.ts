// Sprint 7 E7: the planToStep goals for the Sprint 7 e2e, played on through both seats in
// pass-the-phone (rezWindow 'affordable') and online (rezWindow 'always') games: each story's
// result is the same on both phones and in both modes (S-07-2 AC6, S-07-3 AC6, S-07-4 AC8).
import { replay, type Action, type GameEvent, type GameOptions, type PlayerView, type ServerId, type Side } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { LocalMatch, type MatchUpdate } from '../src/index';
import { SPRINT7_GOALS, STEP_GOALS, planToStep, runnerEventLeaks, runnerViewLeaks, type StepGoal } from '../src/testing';

const MODES: [string, Partial<GameOptions>][] = [
  ['pass-the-phone', {}],
  ['online', { rezWindow: 'always' }],
];
const SEEDS = [1, 2, 3, 7, 42, 99, 12345];

function setup(seed: number, goal: StepGoal, options: Partial<GameOptions>) {
  const plan = planToStep(seed, goal, 1500, options);
  const m = new LocalMatch(seed, options);
  for (const a of plan.actions) expect(m.submit(a.player, a)[a.player].events.some((e) => e.type === 'action_rejected')).toBe(false);
  return { plan, m, info: plan.info as Record<string, string> };
}

/** Submits an action that must be accepted; checks the Runner seat saw nothing hidden. */
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
const rigOf = (v: PlayerView, uid: string) => v.rig.find((c) => c.uid === uid);
const endTurn = (player: Side): Action => ({ type: 'end_turn', player });

describe('Sprint 7 planToStep goals', () => {
  it('are listed in STEP_GOALS', () => {
    for (const g of SPRINT7_GOALS) expect(STEP_GOALS).toContain(g);
  });

  it('work for seeds 1-100 and 12345, pass-the-phone and online', () => {
    for (const goal of SPRINT7_GOALS) {
      for (const seed of [...Array.from({ length: 100 }, (_, i) => i + 1), 12345]) {
        for (const [, options] of MODES) expect(() => planToStep(seed, goal, 1500, options), `${goal} ${seed}`).not.toThrow();
      }
    }
  }, 120_000);

  describe.each(MODES)('%s', (_mode, options) => {
    it.each(SEEDS)('corp_rez_asset (seed %i): Rez PAD for 2, face up on both phones; +1 credit when the Corp turn begins', (seed) => {
      const { m, info } = setup(seed, 'corp_rez_asset', options);
      const credits = m.view('corp').players.corp.credits;
      const u = ok(m, { type: 'rez', player: 'corp', uid: info.uid! });
      both(u, (events, view) => {
        expect(events).toEqual([
          { type: 'credits_spent', player: 'corp', amount: 2 },
          { type: 'card_rezzed', uid: info.uid, cardId: 'c03', server: info.server },
        ]);
        expect(view.corpServers.flatMap((s) => s.content).find((c) => c.uid === info.uid)).toMatchObject({ cardId: 'c03', faceUp: true });
        expect(view.players.corp.credits).toBe(credits - 2);
      });
      ok(m, endTurn('corp'));
      if (m.view('corp').phase === 'discard') ok(m, { type: 'discard', player: 'corp', handIndices: [0] });
      const back = ok(m, endTurn('runner'));
      both(back, (events) => {
        const k = events.findIndex((e) => e.type === 'turn_started');
        expect(events.slice(k + 1, k + 3)).toEqual([
          { type: 'ability_triggered', uid: info.uid, cardId: 'c03', trigger: 'turn_start' },
          { type: 'credit_gained', player: 'corp', amount: 1 },
        ]);
      });
    });

    it.each(SEEDS)('runner_approach_akitaro (seed %i): with 1 credit the Corp is asked; Wall of Static costs 1', (seed) => {
      const { m, info } = setup(seed, 'runner_approach_akitaro', options);
      const v = m.view('corp');
      expect(v.players.corp.credits).toBe(1);
      expect(v.run!.options[0]).toEqual({ action: { type: 'rez', player: 'corp', uid: info.iceUid }, cost: 1, reject: null });
      expect(m.view('runner').run).toMatchObject({ step: 'approach', waitingOn: 'corp' });
      const u = ok(m, { type: 'rez', player: 'corp', uid: info.iceUid! });
      both(u, (events, view) => {
        expect(events.slice(0, 2)).toEqual([
          { type: 'credits_spent', player: 'corp', amount: 1 },
          { type: 'ice_rezzed', uid: info.iceUid, cardId: 'c04' },
        ]);
        expect(view.players.corp.credits).toBe(0);
      });
    });

    it.each(SEEDS)('runner_armitage (seed %i): Take 2 credits; the Corp phone sees 12 -> 10', (seed) => {
      const { m, info } = setup(seed, 'runner_armitage', options);
      const opt = m.view('runner').installedOptions[info.uid!]!;
      expect(opt).toEqual([{ action: { type: 'activate', player: 'runner', uid: info.uid, ability: 0 }, cost: 0, reject: null, clicks: 1, gain: 2 }]);
      const u = ok(m, opt[0]!.action);
      both(u, (events, view) => {
        expect(events).toEqual([
          { type: 'ability_triggered', uid: info.uid, cardId: 'r02', trigger: 'click' },
          { type: 'hosted_credits_changed', uid: info.uid, credits: 10 },
          { type: 'credit_gained', player: 'runner', amount: 2 },
        ]);
        expect(rigOf(view, info.uid!)!.hostedCredits).toBe(10);
      });
    });

    it.each(SEEDS)('runner_cyberfeeder_ice_wall (seed %i): no own credits, Cyberfeeder pays the break; both see 1 -> 0', (seed) => {
      const { m, info } = setup(seed, 'runner_cyberfeeder_ice_wall', options);
      const brk = m.view('runner').run!.options.find((o) => o.action.type === 'use_ability' && o.action.ability === 0)!;
      expect(brk).toMatchObject({ cost: 1, reject: null, hostedPay: [{ uid: info.cyberfeederUid, amount: 1 }] });
      const u = ok(m, brk.action);
      both(u, (events, view) => {
        expect(events.slice(0, 3)).toEqual([
          { type: 'credits_spent', player: 'runner', amount: 1, hosted: 1 },
          { type: 'hosted_credits_changed', uid: info.cyberfeederUid, credits: 0 },
          { type: 'subroutine_broken', iceUid: info.iceUid, sub: 0, breakerUid: info.breakerUid },
        ]);
        expect(rigOf(view, info.cyberfeederUid!)!.hostedCredits).toBe(0);
        expect(view.players.runner.credits).toBe(0);
      });
    });

    it.each(SEEDS)('runner_bank_job_remote (seed %i): Take 8 credits from Bank Job instead of access; Heap; same on both', (seed) => {
      const { m, info } = setup(seed, 'runner_bank_job_remote', options);
      const credits = m.view('runner').players.runner.credits;
      ok(m, { type: 'run', player: 'runner', server: info.server as ServerId });
      const rv = m.view('runner').run!;
      expect(rv.step).toBe('success');
      expect(rv.options).toEqual([
        { action: { type: 'activate', player: 'runner', uid: info.bankJobUid, ability: 0 }, cost: 0, reject: null, gain: 8 },
        { action: { type: 'pass', player: 'runner' }, cost: 0, reject: null },
      ]);
      expect(m.view('corp').run).toMatchObject({ step: 'success', waitingOn: 'runner', options: [] });
      const u = ok(m, rv.options[0]!.action);
      both(u, (events, view) => {
        expect(events).toEqual([
          { type: 'ability_triggered', uid: info.bankJobUid, cardId: 'r10', trigger: 'successful_run' },
          { type: 'hosted_credits_changed', uid: info.bankJobUid, credits: 0 },
          { type: 'credit_gained', player: 'runner', amount: 8 },
          { type: 'rig_card_trashed', uid: info.bankJobUid, cardId: 'r10' },
          { type: 'run_ended', server: info.server, outcome: 'access_replaced' },
        ]);
        expect(view.players.runner.credits).toBe(credits + 8);
        expect(rigOf(view, info.bankJobUid!)).toBeUndefined();
        expect(view.players.runner.discard.at(-1)).toBe('r10');
      });
    });

    it.each(SEEDS)('corp_ice_wall (seed %i): advance twice (both see 2 counters); strength 3; Corroder must pump', (seed) => {
      const { m, info } = setup(seed, 'corp_ice_wall', options);
      const adv: Action = { type: 'advance', player: 'corp', uid: info.uid! };
      expect(m.view('corp').installedOptions[info.uid!]).toEqual([{ action: adv, cost: 1, reject: null }]);
      ok(m, adv);
      const u = ok(m, adv);
      both(u, (events, view) => {
        expect(events).toEqual([
          { type: 'credits_spent', player: 'corp', amount: 1 },
          { type: 'card_advanced', uid: info.uid, advancements: 2 },
        ]);
        expect(view.corpServers.flatMap((s) => s.ice).find((c) => c.uid === info.uid)!.advancements).toBe(2);
      });
      ok(m, endTurn('corp'));
      if (m.view('corp').phase === 'discard') ok(m, { type: 'discard', player: 'corp', handIndices: Array.from({ length: m.view('corp').pendingDiscard }, (_, i) => i) });
      ok(m, { type: 'run', player: 'runner', server: info.server as ServerId });
      if (m.view('corp').run?.step === 'approach') ok(m, { type: 'rez', player: 'corp', uid: info.uid! });
      for (const side of ['corp', 'runner'] as const) expect(m.view(side).run).toMatchObject({ step: 'encounter', ice: { cardId: 'c05', strength: 3 } });
      const opts = m.view('runner').run!.options;
      const brk = opts.find((o) => o.action.type === 'use_ability' && o.action.ability === 0)!;
      expect(brk.reject).toBe('too_weak');
      ok(m, opts.find((o) => o.action.type === 'use_ability' && o.action.ability === 1)!.action);
      expect(m.view('runner').run!.options.find((o) => o.action.type === 'use_ability' && o.action.ability === 0)!.reject).toBeNull();
    });

    it.each(SEEDS)('remote_last_card (seed %i): stealing the only card removes the server for both; names stay; next is new', (seed) => {
      const { m, info } = setup(seed, 'remote_last_card', options);
      const before = m.view('corp').corpServers.map((s) => s.id);
      ok(m, { type: 'run', player: 'runner', server: info.server as ServerId });
      const card = m.view('runner').run!.access!.cards.findIndex((c) => c.uid === info.uid);
      const u = ok(m, { type: 'steal', player: 'runner', card });
      both(u, (events, view) => {
        expect(events.slice(-2)).toEqual([
          { type: 'run_ended', server: info.server, outcome: 'accessed' },
          { type: 'server_removed', server: info.server },
        ]);
        expect(view.corpServers.map((s) => s.id)).toEqual(before.filter((id) => id !== info.server));
        expect(view.corpServers.map((s) => s.id)).toContain(info.otherServer);
      });
    });
  });
});
