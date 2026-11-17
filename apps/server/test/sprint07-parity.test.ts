// Sprint 7 E7 (S-07-2 AC6, S-07-3 AC6, S-07-4 AC8): the new abilities through the online room.
// Each game starts from a planToStep prelude (online rules), the key move is sent over the
// socket, and each phone's update is exactly its projection of the engine's own result, which
// matches pass-the-phone play of the same move (same events).
import { apply, replay, viewEvents, viewFor, type Action, type GameState, type ServerId, type Side } from '@overclock/engine';
import { LocalMatch } from '@overclock/match';
import { planToStep, runnerEventLeaks, runnerViewLeaks, type StepGoal } from '@overclock/match/testing';
import type { ServerMsg } from '@overclock/protocol';
import { describe, expect, it } from 'vitest';
import { ONLINE_OPTIONS } from '../src/room';
import { FakeConn, harness, msg } from './fakes';

const SEEDS = [1, 7, 42];

function onlineGame(seed: number, goal: StepGoal) {
  // Sprint 8: these Sprint 7 goals are planned on the starter decks (test-mode create.deckSet).
  const plan = planToStep(seed, goal, 1500, { rezWindow: ONLINE_OPTIONS.rezWindow });
  const h = harness({ testMode: true });
  const conns: Record<Side, FakeConn> = { corp: new FakeConn('corp'), runner: new FakeConn('runner') };
  h.room.connect(conns.corp, { kind: 'creator', code: 'S7PT' });
  h.room.message(conns.corp, msg({ t: 'create', side: 'corp', test: { seed, actions: plan.actions, deckSet: plan.deckSet } }));
  h.room.connect(conns.runner, { kind: 'player' });
  h.room.message(conns.runner, msg({ t: 'join' }));
  expect(h.room.seq()).toBe(plan.actions.length); // every prelude action accepted under online rules
  let id = 0;
  /** Sends `a` from its seat; returns both phones' update after checking them against the engine. */
  const send = (a: Action) => {
    const before = h.store.get<GameState>('state')!;
    for (const c of Object.values(conns)) c.take();
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
  /** The same move in a pass-the-phone game reaching the same goal (its own plan): the same events, uids aside. */
  const hotSeat = (move: (info: Record<string, string>) => Action) => {
    const p = planToStep(seed, goal);
    const s = replay(seed, p.actions, { deckSet: p.deckSet }).state;
    return apply(s, move(p.info as Record<string, string>)).events.map((e) => e.type);
  };
  return { plan, info: plan.info as Record<string, string>, send, hotSeat };
}

describe('Sprint 7 abilities through the online room: both phones agree, same as pass-the-phone', () => {
  it.each(SEEDS)('S-07-2 (seed %i): Rez PAD Campaign; next Corp turn +1 credit on both phones', (seed) => {
    const g = onlineGame(seed, 'corp_rez_asset');
    const rez = (info: Record<string, string>): Action => ({ type: 'rez', player: 'corp', uid: info.uid! });
    const u = g.send(rez(g.info));
    expect(u.events.map((e) => e.type)).toEqual(g.hotSeat(rez));
    for (const side of ['corp', 'runner'] as const) {
      expect(u[side].view.corpServers.flatMap((s) => s.content).find((c) => c.uid === g.info.uid)).toMatchObject({ cardId: 'c03', faceUp: true });
    }
    let r = g.send({ type: 'end_turn', player: 'corp' });
    if (r.state.phase === 'discard') r = g.send({ type: 'discard', player: 'corp', handIndices: Array.from({ length: r.state.players.corp.hand.length - 5 }, (_, i) => i) });
    const back = g.send({ type: 'end_turn', player: 'runner' });
    for (const side of ['corp', 'runner'] as const) {
      expect(back[side].events).toContainEqual({ type: 'ability_triggered', uid: g.info.uid, cardId: 'c03', trigger: 'turn_start' });
      expect(back[side].events).toContainEqual({ type: 'credit_gained', player: 'corp', amount: 1 });
    }
  });

  it.each(SEEDS)('S-07-2 (seed %i): Akitaro: the Corp at 1 credit rezzes Wall of Static for 1', (seed) => {
    const g = onlineGame(seed, 'runner_approach_akitaro');
    const u = g.send({ type: 'rez', player: 'corp', uid: g.info.iceUid! });
    for (const side of ['corp', 'runner'] as const) {
      expect(u[side].events.slice(0, 2)).toEqual([
        { type: 'credits_spent', player: 'corp', amount: 1 },
        { type: 'ice_rezzed', uid: g.info.iceUid, cardId: 'c04' },
      ]);
    }
  });

  it.each(SEEDS)('S-07-3 AC6 (seed %i): the Runner takes 2 from Armitage; the Corp phone shows 12 -> 10', (seed) => {
    const g = onlineGame(seed, 'runner_armitage');
    const take = (info: Record<string, string>): Action => ({ type: 'activate', player: 'runner', uid: info.uid!, ability: 0 });
    const u = g.send(take(g.info));
    expect(u.events.map((e) => e.type)).toEqual(g.hotSeat(take));
    expect(u.corp.events).toContainEqual({ type: 'hosted_credits_changed', uid: g.info.uid, credits: 10 });
    expect(u.corp.view.rig.find((c) => c.uid === g.info.uid)!.hostedCredits).toBe(10);
  });

  it.each(SEEDS)('S-07-4 AC8 (seed %i): Cyberfeeder pays the break on both phones', (seed) => {
    const g = onlineGame(seed, 'runner_cyberfeeder_ice_wall');
    const brk = (info: Record<string, string>): Action => ({ type: 'use_ability', player: 'runner', uid: info.breakerUid!, ability: 0, sub: 0 });
    const u = g.send(brk(g.info));
    expect(u.events.map((e) => e.type)).toEqual(g.hotSeat(brk));
    for (const side of ['corp', 'runner'] as const) {
      expect(u[side].events[0]).toEqual({ type: 'credits_spent', player: 'runner', amount: 1, hosted: 1 });
      expect(u[side].view.rig.find((c) => c.uid === g.info.cyberfeederUid)!.hostedCredits).toBe(0);
    }
  });

  it.each(SEEDS)('S-07-4 AC8 (seed %i): Bank Job instead of access on both phones', (seed) => {
    const g = onlineGame(seed, 'runner_bank_job_remote');
    const runIt = g.send({ type: 'run', player: 'runner', server: g.info.server as ServerId });
    expect(runIt.corp.view.run).toMatchObject({ step: 'success', waitingOn: 'runner' });
    const u = g.send({ type: 'activate', player: 'runner', uid: g.info.bankJobUid!, ability: 0, amount: 8 }); // Sprint 10: the max
    for (const side of ['corp', 'runner'] as const) {
      expect(u[side].events.at(-1)).toEqual({ type: 'run_ended', server: g.info.server, outcome: 'access_replaced' });
      expect(u[side].events).toContainEqual({ type: 'credit_gained', player: 'runner', amount: 8 });
      expect(u[side].view.rig.find((c) => c.uid === g.info.bankJobUid)).toBeUndefined();
    }
    // Pass-the-phone: the same two moves give the same events.
    const p = planToStep(seed, 'runner_bank_job_remote');
    const m = new LocalMatch(seed, { deckSet: p.deckSet });
    for (const a of p.actions) m.submit(a.player, a);
    m.submit('runner', { type: 'run', player: 'runner', server: p.info.server as ServerId });
    const hs = m.submit('runner', { type: 'activate', player: 'runner', uid: p.info.bankJobUid!, ability: 0, amount: 8 });
    expect(hs.corp.events.map((e) => e.type)).toEqual(u.corp.events.map((e) => e.type));
  });
});
