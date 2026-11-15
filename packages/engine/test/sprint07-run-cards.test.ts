// Sprint 7 E5 (S-07-4): Cyberfeeder's recurring credit (icebreakers only; payment order; refill)
// and Bank Job (successful run on a remote: take its credits instead of accessing). Real play
// from a new game; hands, credits and clicks are set before the first action.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, newGame, viewEvents, viewFor, type Action, type GameState, type ServerId } from '../src/index';
import { finishTurn, liveness, rejection, run, withHand, withPlayer } from './helpers';

const corpInstall = (handIndex: number, server: ServerId | 'new'): Action => ({ type: 'install', player: 'corp', handIndex, server });
const install = (handIndex: number): Action => ({ type: 'install', player: 'runner', handIndex });
const runOn = (server: ServerId): Action => ({ type: 'run', player: 'runner', server });
const pass = (player: 'corp' | 'runner'): Action => ({ type: 'pass', player });
const rez = (uid: string): Action => ({ type: 'rez', player: 'corp', uid });
const activate = (uid: string, ability = 0): Action => ({ type: 'activate', player: 'runner', uid, ability });
const breakSub = (uid: string, sub = 0): Action => ({ type: 'use_ability', player: 'runner', uid, ability: 0, sub });
const pump = (uid: string): Action => ({ type: 'use_ability', player: 'runner', uid, ability: 1 });

/** Corp turn 1 (seed 21): `corpHand` + `corpActions`; then the Runner's turn with `runnerHand` and `credits`. */
function game(corpHand: string[], corpActions: Action[], runnerHand: string[], credits: number, corpClicks = 3): GameState {
  let s = withPlayer(withHand(newGame(21), 'corp', corpHand), 'corp', { clicks: corpClicks });
  s = run(s, corpActions).state;
  s = finishTurn(s).state;
  return withPlayer(withHand(s, 'runner', runnerHand), 'runner', { credits });
}

describe('S-07-4 AC1-AC4: Cyberfeeder', () => {
  it('AC1: installed with 1 credit on it, both players see it', () => {
    const r = apply(game(['c05'], [corpInstall(0, 'new')], ['r08'], 5), install(0));
    expect(r.events).toEqual([
      { type: 'credits_spent', player: 'runner', amount: 2 },
      { type: 'card_installed', player: 'runner', uid: 'i2', zone: 'rig', handIndex: 0, cardId: 'r08' },
      { type: 'hosted_credits_changed', uid: 'i2', credits: 1 },
    ]);
    for (const side of ['corp', 'runner'] as const) expect(viewFor(side, r.state).rig[0]!.hostedCredits).toBe(1);
  });

  /** Ice Wall (i1) on remote1, rezzed on approach; Cyberfeeder (i2) and Corroder (i3) installed; Runner at 0 credits, encountering. */
  function encounterIceWall(): GameState {
    let s = game(['c05'], [corpInstall(0, 'new')], ['r08', 'r04'], 4);
    s = run(s, [install(0), install(0), runOn('remote1'), rez('i1')]).state;
    expect(s.run?.step).toBe('encounter');
    expect(s.players.runner.credits).toBe(0);
    return s;
  }

  it('AC2: no credits of his own: Corroder breaks Ice Wall, Cyberfeeder pays (option says who pays)', () => {
    const s = encounterIceWall();
    const opts = viewFor('runner', s).run!.options;
    expect(opts).toContainEqual({ action: breakSub('i3'), cost: 1, reject: null, hostedPay: [{ uid: 'i2', amount: 1 }] });
    expect(opts).toContainEqual({ action: pump('i3'), cost: 1, reject: null, hostedPay: [{ uid: 'i2', amount: 1 }] });
    const r = apply(s, breakSub('i3'));
    expect(r.events.slice(0, 3)).toEqual([
      { type: 'credits_spent', player: 'runner', amount: 1, hosted: 1 },
      { type: 'hosted_credits_changed', uid: 'i2', credits: 0 },
      { type: 'subroutine_broken', iceUid: 'i1', sub: 0, breakerUid: 'i3' },
    ]);
    expect(r.state.players.runner.credits).toBe(0);
    expect(r.state.rig.find((c) => c.uid === 'i2')!.hostedCredits).toBe(0);
    expect(viewEvents('corp', r.events)).toEqual(r.events);
    for (const side of ['corp', 'runner'] as const) expect(viewFor(side, r.state).rig.find((c) => c.uid === 'i2')!.hostedCredits).toBe(0);
  });

  it('with the credit used and no own credits, breaking is no_credits (no hostedPay listed)', () => {
    let s = encounterIceWall();
    s = run(s, [pump('i3')]).state; // Cyberfeeder pays the pump
    const opt = viewFor('runner', s).run!.options.find((o) => o.action.type === 'use_ability' && o.action.ability === 0)!;
    expect(opt).toEqual({ action: breakSub('i3'), cost: 1, reject: 'no_credits' });
    expect(rejection(apply(s, breakSub('i3')).events)).toBe('no_credits');
  });

  it('AC3: used credit comes back when the Runner turn begins (never more than 1)', () => {
    let s = run(encounterIceWall(), [breakSub('i3'), { type: 'jack_out', player: 'runner' }]).state;
    s = finishTurn(s).state; // Corp turn: no refill
    expect(s.rig.find((c) => c.uid === 'i2')!.hostedCredits).toBe(0);
    const r = finishTurn(s); // Runner turn starts
    const start = r.events.slice(r.events.findIndex((e) => e.type === 'turn_started'));
    expect(start).toEqual([
      { type: 'turn_started', player: 'runner', turn: 4, clicks: 4 },
      { type: 'ability_triggered', uid: 'i2', cardId: 'r08', trigger: 'turn_start' },
      { type: 'hosted_credits_changed', uid: 'i2', credits: 1 },
    ]);
    // Unused: nothing happens at the next turn start, and it stays at 1.
    const again = finishTurn(finishTurn(r.state).state);
    expect(again.events.some((e) => e.type === 'hosted_credits_changed')).toBe(false);
    expect(again.state.rig.find((c) => c.uid === 'i2')!.hostedCredits).toBe(1);
  });

  it('AC4: never pays a trash cost (PAD Campaign 4 with 3 own credits + Cyberfeeder: no_credits)', () => {
    let s = game(['c03'], [corpInstall(0, 'new')], ['r08'], 5);
    s = run(s, [install(0)]).state; // 3 own credits left, Cyberfeeder 1
    s = run(s, [runOn('remote1')]).state;
    const opts = viewFor('runner', s).run!.options;
    expect(opts[0]).toEqual({ action: { type: 'trash', player: 'runner', card: 0 }, cost: 4, reject: 'no_credits' });
    expect(rejection(apply(s, { type: 'trash', player: 'runner', card: 0 }).events)).toBe('no_credits');
  });

  it('AC4: never pays an install (Corroder costs 2 with 1 own credit + Cyberfeeder: no_credits)', () => {
    const s = run(game(['c05'], [corpInstall(0, 'new')], ['r08', 'r04'], 3), [install(0)]).state;
    expect(s.players.runner.credits).toBe(1);
    const opt = viewFor('runner', s).handOptions[0]![0]!;
    expect(opt).toEqual({ action: install(0), cost: 2, reject: 'no_credits' });
  });

  it('payment order: Cyberfeeder first, then run-only credits (bad publicity), then own credits', () => {
    // Corp turn 1 (4 clicks): Hostile Takeover installed, advanced twice, scored (bad publicity 1); Ice Wall on a new remote.
    let s = game(
      ['c08', 'c05'],
      [
        corpInstall(0, 'new'),
        { type: 'advance', player: 'corp', uid: 'i1' },
        { type: 'advance', player: 'corp', uid: 'i1' },
        { type: 'score', player: 'corp', uid: 'i1' },
        corpInstall(0, 'new'),
      ],
      ['r08', 'r04'],
      5,
      4,
    );
    expect(s.badPublicity).toBe(1);
    s = run(s, [install(0), install(0), runOn('remote2'), rez('i2')]).state; // i3 Cyberfeeder, i4 Corroder
    expect(s.run).toMatchObject({ step: 'encounter', tempCredits: 1 });
    expect(s.players.runner.credits).toBe(1);
    const first = apply(s, pump('i4'));
    expect(first.events[0]).toEqual({ type: 'credits_spent', player: 'runner', amount: 1, hosted: 1 });
    const second = apply(first.state, pump('i4'));
    expect(second.events[0]).toEqual({ type: 'credits_spent', player: 'runner', amount: 1, temp: 1 });
    const third = apply(second.state, breakSub('i4'));
    expect(third.events[0]).toEqual({ type: 'credits_spent', player: 'runner', amount: 1 });
    expect(third.state.players.runner.credits).toBe(0);
  });
});

describe('S-07-4 AC5-AC7: Bank Job', () => {
  it('AC5: installed with 8 credits on it', () => {
    const r = apply(game(['c03'], [corpInstall(0, 'new')], ['r10'], 5), install(0));
    expect(r.events.at(-1)).toEqual({ type: 'hosted_credits_changed', uid: 'i2', credits: 8 });
    for (const side of ['corp', 'runner'] as const) expect(viewFor(side, r.state).rig[0]!.hostedCredits).toBe(8);
  });

  /** PAD Campaign alone in remote1; Bank Job (i2) installed; the Runner has just got in. */
  function atSuccess(): GameState {
    const r = run(game(['c03'], [corpInstall(0, 'new')], ['r10'], 5), [install(0), runOn('remote1')]);
    expect(r.events.slice(-2)).toEqual([
      { type: 'run_started', server: 'remote1' },
      { type: 'run_successful', server: 'remote1' },
    ]);
    return r.state;
  }

  it('AC6: a successful run on a remote stops at step success: "Take 8 credits from Bank Job" or "Access cards"', () => {
    const s = atSuccess();
    expect(s.run).toMatchObject({ step: 'success', position: -1, access: null });
    const rv = viewFor('runner', s).run!;
    expect(rv).toMatchObject({ step: 'success', waitingOn: 'runner', iceUid: null, ice: null, access: null, letFire: null });
    expect(rv.options).toEqual([
      { action: activate('i2'), cost: 0, reject: null, gain: 8 },
      { action: pass('runner'), cost: 0, reject: null },
    ]);
    expect(legalActions(s, 'runner')).toEqual([activate('i2'), pass('runner')]);
    expect(viewFor('corp', s).run).toMatchObject({ step: 'success', waitingOn: 'runner', options: [] });
    expect(legalActions(s, 'corp')).toEqual([]);
    expect(liveness(s)).toBe('runner');
  });

  it('AC6: take the credits: +8, nothing accessed, the run ends access_replaced, Bank Job to the Heap', () => {
    const s = atSuccess();
    const credits = s.players.runner.credits;
    const r = apply(s, activate('i2'));
    expect(r.events).toEqual([
      { type: 'ability_triggered', uid: 'i2', cardId: 'r10', trigger: 'successful_run' },
      { type: 'hosted_credits_changed', uid: 'i2', credits: 0 },
      { type: 'credit_gained', player: 'runner', amount: 8 },
      { type: 'rig_card_trashed', uid: 'i2', cardId: 'r10' },
      { type: 'run_ended', server: 'remote1', outcome: 'access_replaced' },
    ]);
    expect(r.state.players.runner.credits).toBe(credits + 8);
    expect(r.state.players.runner.clicks).toBe(s.players.runner.clicks); // no click
    expect(r.state.rig).toEqual([]);
    expect(r.state.players.runner.discard.at(-1)).toEqual({ cardId: 'r10', faceUp: true });
    expect(r.state.servers.find((sv) => sv.id === 'remote1')!.content.map((c) => c.cardId)).toEqual(['c03']); // untouched
    expect(r.state.phase).toBe('action');
    expect(viewFor('runner', r.state).lastRun).toBeNull(); // nothing accessed
    expect(viewEvents('corp', r.events)).toEqual(r.events);
  });

  it('AC6: Access cards (pass): access goes on as usual and Bank Job keeps its credits', () => {
    const r = apply(atSuccess(), pass('runner'));
    expect(r.events).toEqual([{ type: 'card_accessed', cardId: 'c03', from: 'remote', uid: 'i1' }]);
    expect(r.state.run?.step).toBe('access');
    expect(r.state.rig[0]!.hostedCredits).toBe(8);
  });

  it('AC7: HQ, R&D and Archives: no Bank Job choice, access as usual', () => {
    const s = run(game(['c03', 'c02'], [corpInstall(0, 'new'), { type: 'play', player: 'corp', handIndex: 0 }], ['r10'], 5), [install(0)]).state;
    for (const server of ['hq', 'rd', 'archives'] as const) {
      const r = apply(s, runOn(server));
      expect(r.events.map((e) => e.type)).toContain('card_accessed');
      expect(r.state.run?.step).toBe('access');
    }
  });

  it('a remote with only ICE (nothing to access) still offers Bank Job; Access cards then ends the run', () => {
    let s = game(['c05'], [corpInstall(0, 'new')], ['r10'], 5);
    s = run(s, [install(0), runOn('remote1'), pass('corp'), pass('runner')]).state; // Ice Wall not rezzed, continue
    expect(s.run?.step).toBe('success');
    const r = apply(s, pass('runner'));
    expect(r.events).toEqual([{ type: 'run_ended', server: 'remote1', outcome: 'accessed' }]);
  });

  it('no Bank Job (or an empty one): no success step', () => {
    const r = run(game(['c03'], [corpInstall(0, 'new')], [], 5), [runOn('remote1')]);
    expect(r.state.run?.step).toBe('access');
  });

  it('activate Bank Job outside step success: wrong_phase (listed nowhere in installedOptions)', () => {
    const s = run(game(['c03'], [corpInstall(0, 'new')], ['r10'], 5), [install(0)]).state;
    expect(rejection(apply(s, activate('i2')).events)).toBe('wrong_phase');
    expect(viewFor('runner', s).installedOptions).toEqual({});
    const atAccess = apply(atSuccess(), pass('runner')).state;
    expect(rejection(apply(atAccess, activate('i2')).events)).toBe('wrong_phase');
  });
});
