// Sprint 8 E7 (S-08-7): Rototurret ("Trash 1 program", "End the run") and Sacrificial Construct —
// choices in the middle of an ICE (trash_target for the Corp, prevent_trash for the Runner).
import { describe, expect, it } from 'vitest';
import { apply, hasMeaningfulResponse, legalActions, viewFor, waitingOn, type Action, type GameEvent, type GameState } from '../src/index';
import { act, board, liveness, rejection, run, type BoardSpec } from './helpers';
import { expectRunnerEventsClean, expectRunnerViewClean } from './hidden';

const CORE = { deckSet: 'core' } as const;
const types = (events: readonly GameEvent[]) => events.map((e) => e.type);
const runHq: Action = { type: 'run', player: 'runner', server: 'hq' };
const runnerPass: Action = { type: 'pass', player: 'runner' };
const corpPass: Action = { type: 'pass', player: 'corp' };
const choose = (player: 'corp' | 'runner', uid: string): Action => ({ type: 'choose', player, uid });

/** Runner encountering a face-up Rototurret on HQ (its uid comes after the rig's). */
function atTurret(rig: string[], spec: Omit<BoardSpec, 'servers' | 'rig'> = {}): GameState {
  const s = act(board({ ...spec, rig, servers: { hq: { ice: ['+c19'] } } }, 77, CORE), runHq).state;
  expect(s.run?.step).toBe('encounter');
  return s;
}
const turretUid = (rig: string[]) => `i${rig.length + 1}`;

function clean(r: { state: GameState; events: GameEvent[] }, where: string) {
  expectRunnerEventsClean(r.events, where, r.state);
  expectRunnerViewClean(r.state, where);
  liveness(r.state);
}

describe('S-08-7 AC1/AC2: Rototurret trashes 1 program of the Corp’s choice, then ends the run', () => {
  it('no program installed: nothing is trashed (amount 0), then End the run', () => {
    const rig = ['r08'];
    const r = act(atTurret(rig), runnerPass);
    const t = turretUid(rig);
    expect(r.events).toEqual([
      { type: 'subroutine_fired', iceUid: t, sub: 0 },
      { type: 'subroutine_resolved', iceUid: t, cardId: 'c19', outcome: { sub: 0, op: 'trash_installed', amount: 0 } },
      { type: 'subroutine_fired', iceUid: t, sub: 1 },
      { type: 'subroutine_resolved', iceUid: t, cardId: 'c19', outcome: { sub: 1, op: 'end_run', amount: 0 } },
      { type: 'run_ended', server: 'hq', outcome: 'ended_by_ice' },
    ]);
    expect(r.state.rig.map((c) => c.cardId)).toEqual(['r08']);
  });

  it('one program: it goes to the Heap at once (no question), then the run ends', () => {
    const rig = ['r04', 'r08'];
    const s = atTurret(rig);
    expect(viewFor('runner', s).run!.letFire!.outcomes).toEqual([
      { sub: 0, op: 'trash_installed', amount: 1 },
      { sub: 1, op: 'end_run', amount: 0 },
    ]);
    const r = act(s, runnerPass);
    expect(types(r.events)).toEqual(['subroutine_fired', 'rig_card_trashed', 'subroutine_resolved', 'subroutine_fired', 'subroutine_resolved', 'run_ended']);
    expect(r.events[1]).toEqual({ type: 'rig_card_trashed', uid: 'i1', cardId: 'r04' });
    expect(r.state.rig.map((c) => c.cardId)).toEqual(['r08']);
    expect(r.state.players.runner.discard.at(-1)).toEqual({ cardId: 'r04', faceUp: true });
    clean(r, 'one program');
  });

  it('two programs: the Corp is asked (trash_target) mid-run; the run stays; only choose is offered', () => {
    const rig = ['r04', 'r05', 'r09'];
    const r = act(atTurret(rig), runnerPass);
    const t = turretUid(rig);
    expect(r.events).toEqual([
      { type: 'subroutine_fired', iceUid: t, sub: 0 },
      { type: 'choice_opened', kind: 'trash_target', player: 'corp', cardId: 'c19' },
    ]);
    const s = r.state;
    expect(s.phase).toBe('choice');
    expect(s.run).toMatchObject({ step: 'encounter', firing: 0 });
    expect(waitingOn(s)).toBe('corp');
    expect(hasMeaningfulResponse(s, 'corp')).toBe(true);
    expect(hasMeaningfulResponse(s, 'runner')).toBe(false);
    const cv = viewFor('corp', s);
    expect(cv.choice).toEqual({
      kind: 'trash_target',
      waitingOn: 'corp',
      cardId: 'c19',
      options: [
        { action: choose('corp', 'i1'), cost: 0, reject: null },
        { action: choose('corp', 'i2'), cost: 0, reject: null },
      ],
    });
    expect(legalActions(s, 'corp')).toEqual([choose('corp', 'i1'), choose('corp', 'i2')]);
    const rv = viewFor('runner', s);
    expect(rv.choice).toMatchObject({ kind: 'trash_target', waitingOn: 'corp', options: [] });
    expect(rv.run).toMatchObject({ step: 'encounter', waitingOn: 'corp', iceUid: t, options: [], letFire: null });
    expect(legalActions(s, 'runner')).toEqual([]);
    clean(r, 'trash_target open');
  });

  it('the Corp picks Gordian Blade: choice_closed, rig_card_trashed, subroutine_resolved{1}, then End the run', () => {
    const rig = ['r04', 'r05'];
    const s = act(atTurret(rig), runnerPass).state;
    const r = act(s, choose('corp', 'i2'));
    const t = turretUid(rig);
    expect(r.events).toEqual([
      { type: 'choice_closed', kind: 'trash_target', skipped: false },
      { type: 'rig_card_trashed', uid: 'i2', cardId: 'r05' },
      { type: 'subroutine_resolved', iceUid: t, cardId: 'c19', outcome: { sub: 0, op: 'trash_installed', amount: 1 } },
      { type: 'subroutine_fired', iceUid: t, sub: 1 },
      { type: 'subroutine_resolved', iceUid: t, cardId: 'c19', outcome: { sub: 1, op: 'end_run', amount: 0 } },
      { type: 'run_ended', server: 'hq', outcome: 'ended_by_ice' },
    ]);
    expect(r.state.phase).toBe('action');
    expect(r.state.choice).toBeNull();
    expect(r.state.rig.map((c) => c.cardId)).toEqual(['r04']);
    clean(r, 'trash_target answered');
  });

  it('with End the run broken, the run goes on after the trash (the ICE is passed)', () => {
    // Break "End the run" with Pipeline (strength 1 ≥ 0), then let "Trash 1 program" fire.
    const rig = ['r16', 'r04'];
    let s = atTurret(rig, { runnerCredits: 5 });
    s = act(s, { type: 'use_ability', player: 'runner', uid: 'i1', ability: 0, sub: 1 }).state;
    s = act(s, runnerPass).state;
    expect(s.phase).toBe('choice');
    const r = act(s, choose('corp', 'i2'));
    expect(types(r.events).slice(-2)).toEqual(['subroutine_resolved', 'ice_passed']);
    expect(r.state.phase).toBe('run');
    expect(r.state.run!.step).toBe('continue');
    expect(r.state.run!.firing).toBeNull();
    clean(r, 'run goes on');
  });

  it('rejections in trash_target: pass bad_target (mandatory), rez wrong_phase, a hardware/unknown uid bad_target, the Runner not_your_turn', () => {
    const s = act(atTurret(['r04', 'r05', 'r09']), runnerPass).state;
    expect(rejection(apply(s, corpPass).events)).toBe('bad_target');
    expect(rejection(apply(s, { type: 'rez', player: 'corp', uid: 'i4' }).events)).toBe('wrong_phase');
    expect(rejection(apply(s, choose('corp', 'i3')).events)).toBe('bad_target');
    expect(rejection(apply(s, choose('corp', 'zz')).events)).toBe('bad_target');
    expect(rejection(apply(s, choose('runner', 'i1')).events)).toBe('not_your_turn');
    expect(rejection(apply(s, runnerPass).events)).toBe('not_your_turn');
    expect(rejection(apply(s, { type: 'choose', player: 'corp', uid: 7 } as unknown as Action).events)).toBe('invalid_action');
    expect(rejection(apply(s, { type: 'gain_credit', player: 'corp' }).events)).toBe('not_your_turn');
    // choose outside a choice
    expect(rejection(apply(atTurret(['r04']), choose('runner', 'i1')).events)).toBe('wrong_phase');
  });

  it('a trashed breaker loses its boosts for the run (Gordian Blade pumped on an earlier code gate)', () => {
    const s0 = act(board({ rig: ['r05', 'r04'], runnerCredits: 9, servers: { hq: { ice: ['+c19', '+c06'] } } }, 77, CORE), runHq).state;
    let s = run(s0, [
      { type: 'use_ability', player: 'runner', uid: 'i1', ability: 1 },
      { type: 'use_ability', player: 'runner', uid: 'i1', ability: 0, sub: 0 },
      { type: 'use_ability', player: 'runner', uid: 'i1', ability: 0, sub: 1 },
      runnerPass, // continue to Rototurret
    ]).state;
    expect(s.run!.runBoost['i1']).toBe(1);
    s = act(s, runnerPass).state; // let it fire: Corp chooses
    const r = act(s, choose('corp', 'i1'));
    expect(r.state.run).toBeNull();
    expect(types(r.events)).not.toContain('strength_changed');
  });
});

describe('S-08-7 AC3/AC4: Sacrificial Construct — "Save it? Trash Sacrificial Construct instead"', () => {
  it('one program + Construct: the Runner is asked (prevent_trash, target = the program); choose / pass offered', () => {
    const rig = ['r04', 'r12'];
    const r = act(atTurret(rig), runnerPass);
    expect(r.events).toEqual([
      { type: 'subroutine_fired', iceUid: turretUid(rig), sub: 0 },
      { type: 'choice_opened', kind: 'prevent_trash', player: 'runner', cardId: 'c19', target: 'i1' },
    ]);
    expect(waitingOn(r.state)).toBe('runner');
    expect(viewFor('runner', r.state).choice).toEqual({
      kind: 'prevent_trash',
      waitingOn: 'runner',
      cardId: 'c19',
      target: 'i1',
      options: [
        { action: choose('runner', 'i2'), cost: 0, reject: null },
        { action: runnerPass, cost: 0, reject: null },
      ],
    });
    expect(viewFor('corp', r.state).choice).toMatchObject({ kind: 'prevent_trash', waitingOn: 'runner', target: 'i1', options: [] });
    expect(legalActions(r.state, 'corp')).toEqual([]);
    clean(r, 'prevent_trash open');
  });

  it('saving it: choice_closed, rig_card_trashed{Construct}, trash_prevented, subroutine_resolved{0}, End the run', () => {
    const rig = ['r04', 'r12'];
    const s = act(atTurret(rig), runnerPass).state;
    const r = act(s, choose('runner', 'i2'));
    const t = turretUid(rig);
    expect(r.events).toEqual([
      { type: 'choice_closed', kind: 'prevent_trash', skipped: false },
      { type: 'rig_card_trashed', uid: 'i2', cardId: 'r12' },
      { type: 'trash_prevented', uid: 'i1', cardId: 'r04', byUid: 'i2', byCardId: 'r12' },
      { type: 'subroutine_resolved', iceUid: t, cardId: 'c19', outcome: { sub: 0, op: 'trash_installed', amount: 0 } },
      { type: 'subroutine_fired', iceUid: t, sub: 1 },
      { type: 'subroutine_resolved', iceUid: t, cardId: 'c19', outcome: { sub: 1, op: 'end_run', amount: 0 } },
      { type: 'run_ended', server: 'hq', outcome: 'ended_by_ice' },
    ]);
    expect(r.state.rig.map((c) => c.cardId)).toEqual(['r04']);
    expect(r.state.players.runner.discard.map((d) => d.cardId)).toEqual(['r12']);
    clean(r, 'saved');
  });

  it('declining (pass): choice_closed{skipped}, the program goes to the Heap (amount 1)', () => {
    const rig = ['r04', 'r12'];
    const s = act(atTurret(rig), runnerPass).state;
    const r = act(s, runnerPass);
    expect(r.events.slice(0, 3)).toEqual([
      { type: 'choice_closed', kind: 'prevent_trash', skipped: true },
      { type: 'rig_card_trashed', uid: 'i1', cardId: 'r04' },
      { type: 'subroutine_resolved', iceUid: turretUid(rig), cardId: 'c19', outcome: { sub: 0, op: 'trash_installed', amount: 1 } },
    ]);
    expect(r.state.rig.map((c) => c.cardId)).toEqual(['r12']);
  });

  it('two programs + Construct: the Corp picks, then the Runner decides (decider Runner → Corp → Runner)', () => {
    const rig = ['r04', 'r05', 'r12'];
    let s = act(atTurret(rig), runnerPass).state;
    expect(waitingOn(s)).toBe('corp');
    const picked = act(s, choose('corp', 'i1'));
    expect(picked.events).toEqual([
      { type: 'choice_closed', kind: 'trash_target', skipped: false },
      { type: 'choice_opened', kind: 'prevent_trash', player: 'runner', cardId: 'c19', target: 'i1' },
    ]);
    s = picked.state;
    expect(waitingOn(s)).toBe('runner');
    expect(s.run!.firing).toBe(0);
    clean(picked, 'corp picked, runner asked');
    const saved = act(s, choose('runner', 'i3'));
    expect(types(saved.events)).toEqual(['choice_closed', 'rig_card_trashed', 'trash_prevented', 'subroutine_resolved', 'subroutine_fired', 'subroutine_resolved', 'run_ended']);
    expect(saved.state.rig.map((c) => c.cardId)).toEqual(['r04', 'r05']);
  });

  it('Construct never saves itself or a resource; rejections in prevent_trash', () => {
    const s = act(atTurret(['r04', 'r12', 'r02']), runnerPass).state;
    expect(rejection(apply(s, choose('runner', 'i1')).events)).toBe('bad_target'); // the target itself
    expect(rejection(apply(s, choose('runner', 'i3')).events)).toBe('bad_target'); // Armitage cannot prevent
    expect(rejection(apply(s, choose('corp', 'i2')).events)).toBe('not_your_turn');
    expect(rejection(apply(s, { type: 'use_ability', player: 'runner', uid: 'i1', ability: 0, sub: 0 }).events)).toBe('wrong_phase');
    expect(rejection(apply(s, { type: 'jack_out', player: 'runner' }).events)).toBe('wrong_phase');
  });

  it('the same answers always give the same state (pure, deterministic)', () => {
    const rig = ['r04', 'r05', 'r12'];
    const base = act(atTurret(rig), runnerPass).state;
    const a = run(base, [choose('corp', 'i2'), runnerPass]).state;
    const b = run(base, [choose('corp', 'i2'), runnerPass]).state;
    expect(a).toEqual(b);
    expect(a.rig.map((c) => c.cardId)).toEqual(['r04', 'r12']);
  });
});
