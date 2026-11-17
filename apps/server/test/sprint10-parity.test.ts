// Sprint 10 E3 (S-10-3 AC9): Bank Job's chosen amount through the online room. Each game starts from a
// planToStep prelude (online rules); the key moves go over the sockets; each phone's update is exactly
// its projection of the engine's result, which matches pass-the-phone play (same events). A refused
// amount goes only to the Runner's phone.
import { apply, viewEvents, viewFor, type Action, type GameState, type ServerId, type Side } from '@overclock/engine';
import { LocalMatch } from '@overclock/match';
import { planToStep, runnerEventLeaks, runnerViewLeaks, type StepGoal } from '@overclock/match/testing';
import type { ServerMsg } from '@overclock/protocol';
import { describe, expect, it } from 'vitest';
import { ONLINE_OPTIONS } from '../src/room';
import { FakeConn, harness, msg } from './fakes';

const SEEDS = [1, 7, 42];

function onlineGame(seed: number, goal: StepGoal) {
  const plan = planToStep(seed, goal, 1500, { rezWindow: ONLINE_OPTIONS.rezWindow });
  const h = harness({ testMode: true });
  const conns: Record<Side, FakeConn> = { corp: new FakeConn('corp'), runner: new FakeConn('runner') };
  h.room.connect(conns.corp, { kind: 'creator', code: 'S10P' });
  h.room.message(conns.corp, msg({ t: 'create', side: 'corp', test: { seed, actions: plan.actions, deckSet: plan.deckSet } }));
  h.room.connect(conns.runner, { kind: 'player' });
  h.room.message(conns.runner, msg({ t: 'join' }));
  expect(h.room.seq()).toBe(plan.actions.length);
  let id = 0;
  const clear = () => {
    for (const c of Object.values(conns)) c.take();
  };
  /** Sends `a` from its seat; returns both phones' update after checking them against the engine. */
  const send = (a: Action) => {
    const before = h.store.get<GameState>('state')!;
    clear();
    h.room.message(conns[a.player], msg({ t: 'act', id: ++id, action: a }));
    const r = apply(before, a);
    expect(r.events.some((e) => e.type === 'action_rejected'), JSON.stringify(a)).toBe(false);
    expect(h.store.get<GameState>('state')).toEqual(r.state);
    const out = {} as Record<Side, Extract<ServerMsg, { t: 'update' }>>;
    for (const side of ['corp', 'runner'] as const) {
      const u = conns[side].take().find((m) => m.t === 'update');
      if (u?.t !== 'update') throw new Error(`${side}: no update`);
      expect(u.events).toEqual(viewEvents(side, r.events));
      expect(u.view).toEqual(viewFor(side, r.state));
      out[side] = u;
    }
    expect(runnerEventLeaks(out.runner.events, r.state)).toEqual([]);
    expect(runnerViewLeaks(r.state, out.runner.view)).toEqual([]);
    return { ...out, state: r.state, events: r.events };
  };
  /** Sends a move that must be refused: only the sender hears; nothing changes. */
  const refused = (a: Action) => {
    const before = h.store.get<GameState>('state')!;
    const seq = h.room.seq();
    clear();
    h.room.message(conns[a.player], msg({ t: 'act', id: ++id, action: a }));
    const other: Side = a.player === 'corp' ? 'runner' : 'corp';
    const mine = conns[a.player].take();
    expect(conns[other].take()).toEqual([]);
    expect(h.store.get<GameState>('state')).toEqual(before);
    expect(h.room.seq()).toBe(seq);
    return mine;
  };
  return { plan, info: plan.info as Record<string, string>, send, refused };
}

const bankJob = (view: { rig: readonly { uid: string; hostedCredits: number }[] }, uid: string) => view.rig.find((c) => c.uid === uid);

describe('Sprint 10 Bank Job amount through the online room: both phones agree, same as pass-the-phone', () => {
  it.each(SEEDS)('S-10-3 AC9 (seed %i): take 3 of 8 — both phones show 5 on Bank Job and +3 for the Runner', (seed) => {
    const g = onlineGame(seed, 'runner_bank_job_remote');
    const server = g.info.server as ServerId;
    const uid = g.info.bankJobUid!;
    const runIt = g.send({ type: 'run', player: 'runner', server });
    expect(runIt.corp.view.run).toMatchObject({ step: 'success', waitingOn: 'runner', options: [] });
    expect(runIt.runner.view.run!.options.map((o) => o.action)).toEqual([
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((amount) => ({ type: 'activate', player: 'runner', uid, ability: 0, amount })),
      { type: 'pass', player: 'runner' },
    ]);
    const credits = runIt.runner.view.players.runner.credits;
    const take: Action = { type: 'activate', player: 'runner', uid, ability: 0, amount: 3 };
    const u = g.send(take);
    for (const side of ['corp', 'runner'] as const) {
      expect(u[side].events).toEqual([
        { type: 'ability_triggered', uid, cardId: 'r10', trigger: 'successful_run' },
        { type: 'hosted_credits_changed', uid, credits: 5 },
        { type: 'credit_gained', player: 'runner', amount: 3 },
        { type: 'run_ended', server, outcome: 'access_replaced' },
      ]);
      expect(bankJob(u[side].view, uid)!.hostedCredits).toBe(5);
      expect(u[side].view.players.runner.credits).toBe(credits + 3);
      expect(u[side].view.run).toBeNull();
    }
    // Pass-the-phone: the same moves give the same events.
    const p = planToStep(seed, 'runner_bank_job_remote');
    const m = new LocalMatch(seed, { deckSet: p.deckSet });
    for (const a of p.actions) m.submit(a.player, a);
    m.submit('runner', { type: 'run', player: 'runner', server: p.info.server as ServerId });
    const hs = m.submit('runner', { type: 'activate', player: 'runner', uid: p.info.bankJobUid!, ability: 0, amount: 3 });
    for (const side of ['corp', 'runner'] as const) expect(hs[side].events.map((e) => e.type)).toEqual(u[side].events.map((e) => e.type));
    expect(bankJob(hs.corp.view, p.info.bankJobUid!)!.hostedCredits).toBe(5);
  });

  it.each(SEEDS)('S-10-3 (seed %i): Access cards instead — Bank Job keeps 8 on both phones', (seed) => {
    const g = onlineGame(seed, 'runner_bank_job_remote');
    const uid = g.info.bankJobUid!;
    g.send({ type: 'run', player: 'runner', server: g.info.server as ServerId });
    const u = g.send({ type: 'pass', player: 'runner' });
    for (const side of ['corp', 'runner'] as const) {
      expect(u[side].events.map((e) => e.type)).toContain('card_accessed');
      expect(bankJob(u[side].view, uid)!.hostedCredits).toBe(8);
    }
  });

  it.each(SEEDS)('S-10-3 (seed %i): a bad amount is refused on the Runner’s phone only; the Corp hears nothing', (seed) => {
    const g = onlineGame(seed, 'runner_bank_job_remote');
    const uid = g.info.bankJobUid!;
    g.send({ type: 'run', player: 'runner', server: g.info.server as ServerId });
    for (const [amount, reason] of [[9, 'bad_target'], [0, 'bad_target'], [2.5, 'invalid_action']] as const) {
      const mine = g.refused({ type: 'activate', player: 'runner', uid, ability: 0, amount });
      expect(mine).toMatchObject([{ t: 'rejected', events: [{ type: 'action_rejected', reason }] }]);
    }
    const missing = g.refused({ type: 'activate', player: 'runner', uid, ability: 0 });
    expect(missing).toMatchObject([{ t: 'rejected', events: [{ type: 'action_rejected', reason: 'invalid_action' }] }]);
  });
});
