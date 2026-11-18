// Sprint 9 E7 (S-09-1 AC7, S-09-2 AC6, S-09-3 AC5, S-09-4): traces, tags, Private Security Force and SEA
// Source through the online room on the core decks. Each game starts from a planToStep prelude (online
// rules); the key moves go over the sockets; each phone's update is exactly its projection of the engine's
// result, which matches pass-the-phone play (same event types).
import { apply, replay, viewEvents, viewFor, type Action, type GameState, type Side } from '@overclock/engine';
import { planToStep, runnerEventLeaks, runnerViewLeaks, type StepGoal } from '@overclock/match/testing';
import type { ServerMsg } from '@overclock/protocol';
import { describe, expect, it } from 'vitest';
import { ONLINE_OPTIONS, type RoomMeta } from '../src/room';
import { FakeConn, harness, msg } from './fakes';

const SEEDS = [1, 7, 42];

function onlineGame(seed: number, goal: StepGoal) {
  const plan = planToStep(seed, goal, 1500, { rezWindow: ONLINE_OPTIONS.rezWindow });
  expect(plan.deckSet).toBe('core');
  const h = harness({ testMode: true });
  const conns: Record<Side, FakeConn> = { corp: new FakeConn('corp'), runner: new FakeConn('runner') };
  h.room.connect(conns.corp, { kind: 'creator', code: 'S9PT' });
  // Sprint 12: the 30-card decks are a test fixture now (the default is 'core45'): name them.
  h.room.message(conns.corp, msg({ t: 'create', side: 'corp', test: { seed, actions: plan.actions, deckSet: plan.deckSet } }));
  h.room.connect(conns.runner, { kind: 'player' });
  h.room.message(conns.runner, msg({ t: 'join' }));
  expect(h.room.seq()).toBe(plan.actions.length);
  expect(h.store.get<RoomMeta>('meta')!.options).toEqual({ ...ONLINE_OPTIONS, deckSet: 'core' });
  let id = 0;
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
  /** The same moves in a pass-the-phone game reaching the same goal (its own plan): the same event types. */
  const hotSeat = (moves: ((info: Record<string, string>) => Action)[]) => {
    const p = planToStep(seed, goal);
    let s = replay(seed, p.actions, { deckSet: p.deckSet }).state;
    const out: string[][] = [];
    for (const move of moves) {
      const r = apply(s, move(p.info as Record<string, string>));
      out.push(r.events.map((e) => e.type));
      s = r.state;
    }
    return out;
  };
  return { info: plan.info as Record<string, string>, send, hotSeat };
}

const types = (u: { events: readonly { type: string }[] }) => u.events.map((e) => e.type);

describe('Sprint 9 through the online room (core decks): both phones agree, same as pass-the-phone', () => {
  it.each(SEEDS)('S-09-1 AC7 (seed %i): Hunter — the Corp bids on its phone (Runner waits), then the Runner; same result', (seed) => {
    const g = onlineGame(seed, 'hunter_encounter');
    const fire = () => ({ type: 'pass', player: 'runner' }) as Action;
    const corpBid = () => ({ type: 'trace_bid', player: 'corp', credits: 2 }) as Action;
    const runnerBid = () => ({ type: 'trace_bid', player: 'runner', credits: 3 }) as Action;
    const a = g.send(fire());
    for (const side of ['corp', 'runner'] as const) expect(a[side].view.choice).toMatchObject({ kind: 'trace_corp', waitingOn: 'corp', trace: { base: 3, link: 1 } });
    expect(a.runner.view.choice!.options).toEqual([]);
    expect(a.corp.view.choice!.options.length).toBeGreaterThan(1);
    const b = g.send(corpBid());
    for (const side of ['corp', 'runner'] as const) expect(b[side].view.choice).toMatchObject({ kind: 'trace_runner', waitingOn: 'runner', trace: { strength: 5, needed: 4 } });
    expect(b.corp.view.choice!.options).toEqual([]);
    const c = g.send(runnerBid());
    for (const side of ['corp', 'runner'] as const) {
      expect(c[side].events).toContainEqual({ type: 'trace_resolved', cardId: 'c20', strength: 5, total: 4, success: true });
      expect(c[side].view.players.runner.tags).toBe(1);
    }
    const hot = g.hotSeat([fire, corpBid, runnerBid]);
    expect([types(a), types(b), types(c)]).toEqual(hot);
  });

  it.each(SEEDS)('S-09-1 AC6 (seed %i): a broke Corp bids 0 at once online too (no Corp window)', (seed) => {
    const g = onlineGame(seed, 'hunter_corp_broke');
    const u = g.send({ type: 'pass', player: 'runner' });
    for (const side of ['corp', 'runner'] as const) expect(u[side].view.choice).toMatchObject({ kind: 'trace_runner', waitingOn: 'runner' });
    expect(u.runner.events).toContainEqual({ type: 'trace_bid', player: 'corp', credits: 0, total: 3, auto: true });
  });

  it.each(SEEDS)('S-09-2 AC6 (seed %i): trash a resource / remove a tag give the same result on both phones', (seed) => {
    const t = onlineGame(seed, 'runner_tagged_corp_turn');
    const trash = (i: Record<string, string>): Action => ({ type: 'trash_resource', player: 'corp', uid: i.armitageUid! });
    const u = t.send(trash(t.info));
    for (const side of ['corp', 'runner'] as const) {
      expect(u[side].view.rig.some((c) => c.uid === t.info.armitageUid)).toBe(false);
      expect(u[side].view.players.runner.discard.at(-1)).toBe('r02');
    }
    expect(types(u)).toEqual(t.hotSeat([trash])[0]);
    const r = onlineGame(seed, 'runner_tagged_own_turn');
    const remove = (): Action => ({ type: 'remove_tag', player: 'runner' });
    const v = r.send(remove());
    for (const side of ['corp', 'runner'] as const) expect(v[side].view.players.runner.tags).toBe(Number(r.info.tags) - 1);
    expect(types(v)).toEqual(r.hotSeat([remove])[0]);
  });

  it.each(SEEDS)('S-09-3 AC5 (seed %i): Private Security Force — both phones show the same lost card face up in the Heap', (seed) => {
    const g = onlineGame(seed, 'psf_scored_tagged');
    const use = (i: Record<string, string>): Action => ({ type: 'activate', player: 'corp', uid: i.uid!, ability: 0 });
    const u = g.send(use(g.info));
    const lost = u.corp.events.find((e) => e.type === 'meat_damage');
    expect(u.runner.events.find((e) => e.type === 'meat_damage')).toEqual(lost);
    expect(u.runner.view.players.runner.discard).toEqual(u.corp.view.players.runner.discard);
    expect(types(u)).toEqual(g.hotSeat([use])[0]);
  });

  it.each(SEEDS)('S-09-4 (seed %i): SEA Source online — Corp bids, then the Runner on his phone', (seed) => {
    const g = onlineGame(seed, 'sea_source_ready');
    const play = (i: Record<string, string>): Action => ({ type: 'play', player: 'corp', handIndex: Number(i.handIndex) });
    const u = g.send(play(g.info));
    for (const side of ['corp', 'runner'] as const) expect(u[side].events).toContainEqual(expect.objectContaining({ type: 'trace_started', cardId: 'c22', base: 3 }));
    expect(types(u)).toEqual(g.hotSeat([play])[0]);
  });
});
