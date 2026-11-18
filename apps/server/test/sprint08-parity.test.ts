// Sprint 8 E8 (S-08-1 AC6, S-08-2 AC6, S-08-3 AC6, S-08-4 AC6, S-08-7 AC5): the Sprint 8 cards
// through the online room on the core decks. Each game starts from a planToStep prelude (online
// rules), the key moves are sent over the sockets, and each phone's update is exactly its
// projection of the engine's result, which matches pass-the-phone play (same events).
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
  h.room.connect(conns.corp, { kind: 'creator', code: 'S8PT' });
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

describe('Sprint 8 cards through the online room (core decks): both phones agree, same as pass-the-phone', () => {
  it.each(SEEDS)('S-08-1 AC6 (seed %i): first Corp install +1, first Runner program at 1 credit, same credits on both phones', (seed) => {
    const g = onlineGame(seed, 'corp_first_install');
    const install = (i: Record<string, string>): Action => ({ type: 'install', player: 'corp', handIndex: Number(i.handIndex), server: 'new' });
    const u = g.send(install(g.info));
    expect(u.corp.view.players.corp.credits).toBe(u.runner.view.players.corp.credits);
    expect(u.runner.events).toContainEqual({ type: 'ability_triggered', uid: 'id:corp', cardId: 'c13', trigger: 'install' });
    expect([u.events.map((e) => e.type)]).toEqual(g.hotSeat([install]));
    const k = onlineGame(seed, 'runner_kate_discount');
    const corroder = (i: Record<string, string>): Action => ({ type: 'install', player: 'runner', handIndex: Number(i.corroderIndex) });
    const before = k.send({ type: 'gain_credit', player: 'runner' }).runner.view.players.runner.credits;
    const r = k.send({ type: 'install', player: 'runner', handIndex: Number(k.info.corroderIndex) });
    for (const side of ['corp', 'runner'] as const) expect(r[side].view.players.runner.credits).toBe(before - 1);
    expect(r.events.map((e) => e.type)).toEqual(k.hotSeat([corroder])[0]);
  });

  it.each(SEEDS)('S-08-2 AC6 (seed %i): Adonis, Melange and Biotic Labor give the same result on both phones', (seed) => {
    const a = onlineGame(seed, 'corp_rez_adonis');
    const rez = (i: Record<string, string>): Action => ({ type: 'rez', player: 'corp', uid: i.uid! });
    const ur = a.send(rez(a.info));
    for (const side of ['corp', 'runner'] as const) {
      expect(ur[side].view.corpServers.flatMap((sv) => sv.content).find((c) => c.uid === a.info.uid)).toMatchObject({ cardId: 'c14', hostedCredits: 12 });
    }
    expect(ur.events.map((e) => e.type)).toEqual(a.hotSeat([rez])[0]);
    const m = onlineGame(seed, 'corp_melange');
    const use = (i: Record<string, string>): Action => ({ type: 'activate', player: 'corp', uid: i.uid!, ability: 0 });
    const um = m.send(use(m.info));
    expect(um.corp.view.players.corp.credits).toBe(um.runner.view.players.corp.credits);
    expect(um.events.map((e) => e.type)).toEqual(m.hotSeat([use])[0]);
    const b = onlineGame(seed, 'corp_biotic_labor');
    const play = (i: Record<string, string>): Action => ({ type: 'play', player: 'corp', handIndex: Number(i.handIndex) });
    const ub = b.send(play(b.info));
    for (const side of ['corp', 'runner'] as const) expect(ub[side].view.players.corp.clicks).toBe(4);
    expect(ub.events.map((e) => e.type)).toEqual(b.hotSeat([play])[0]);
  });

  it.each(SEEDS)('S-08-3 AC6 (seed %i): Viktor 1.0 — the lower hand limit and the same lost card in the Heap on both phones', (seed) => {
    const g = onlineGame(seed, 'viktor_encounter');
    const u = g.send({ type: 'pass', player: 'runner' });
    const heap = u.runner.view.players.runner.discard;
    for (const side of ['corp', 'runner'] as const) {
      expect(u[side].view.players.runner.maxHandSize).toBe(4);
      expect(u[side].view.players.runner.discard).toEqual(heap);
    }
    expect(u.events.map((e) => e.type)).toEqual(g.hotSeat([() => ({ type: 'pass', player: 'runner' })])[0]);
  });

  it.each(SEEDS)('S-08-4 AC6 (seed %i): Battering Ram breaks two at once on both phones', (seed) => {
    const g = onlineGame(seed, 'heimdall_ram_encounter');
    const pump = (i: Record<string, string>): Action => ({ type: 'use_ability', player: 'runner', uid: i.breakerUid!, ability: 1 });
    const brk = (i: Record<string, string>): Action => ({ type: 'use_ability', player: 'runner', uid: i.breakerUid!, ability: 0, subs: [0, 1] });
    for (let k = 0; k < 3; k++) g.send(pump(g.info));
    const u = g.send(brk(g.info));
    for (const side of ['corp', 'runner'] as const) expect(u[side].view.run!.ice!.subroutines.map((x) => x.broken)).toEqual([true, true, false]);
    expect(u.events.map((e) => e.type)).toEqual(g.hotSeat([pump, pump, pump, brk])[3]);
  });

  it.each([1, 2, 7])('S-08-7 AC5 (seed %i): Rototurret choices go Runner → Corp (→ Runner) over the sockets', (seed) => {
    const g = onlineGame(seed, 'rototurret_two_programs');
    const fire = g.send({ type: 'pass', player: 'runner' });
    for (const side of ['corp', 'runner'] as const) expect(fire[side].view.choice).toMatchObject({ kind: 'trash_target', waitingOn: 'corp' });
    expect(fire.runner.view.choice!.options).toEqual([]);
    const target = g.info.programs!.split(',')[0]!;
    const pick = g.send({ type: 'choose', player: 'corp', uid: target });
    const moves: ((i: Record<string, string>) => Action)[] = [() => ({ type: 'pass', player: 'runner' }), (i) => ({ type: 'choose', player: 'corp', uid: i.programs!.split(',')[0]! })];
    if (g.info.construct) {
      for (const side of ['corp', 'runner'] as const) expect(pick[side].view.choice).toMatchObject({ kind: 'prevent_trash', waitingOn: 'runner', target });
      const save = g.send({ type: 'choose', player: 'runner', uid: g.info.construct });
      for (const side of ['corp', 'runner'] as const) expect(save[side].view.rig.some((c) => c.uid === target)).toBe(true);
      moves.push((i) => ({ type: 'choose', player: 'runner', uid: i.construct! }));
      expect(save.events.map((e) => e.type)).toEqual(g.hotSeat(moves)[2]);
    } else {
      for (const side of ['corp', 'runner'] as const) expect(pick[side].view.rig.some((c) => c.uid === target)).toBe(false);
      expect(pick.events.map((e) => e.type)).toEqual(g.hotSeat(moves)[1]);
    }
  });
});

describe('Sprint 8 test-mode deckSet (create.test.deckSet)', () => {
  it("test mode: 'starter' plays the Sprint 7 decks without identities, 'core' the 30-card decks; absent = core45 (Sprint 12)", () => {
    for (const [deckSet, identity] of [['starter', null], ['core', 'c13'], [undefined, 'c13']] as const) {
      const h = harness({ testMode: true });
      const c = new FakeConn('c');
      h.room.connect(c, { kind: 'creator', code: 'DKST' });
      h.room.message(c, msg({ t: 'create', side: 'corp', test: { seed: 3, actions: [], ...(deckSet ? { deckSet } : {}) } }));
      const state = h.store.get<GameState>('state')!;
      expect(state.options.deckSet).toBe(deckSet ?? 'core45');
      expect(state.players.corp.identity).toBe(identity);
      expect(state.players.corp.hand.length + state.players.corp.deck.length).toBe(deckSet === 'starter' ? 17 : deckSet === 'core' ? 30 : 45);
      expect(h.store.get<RoomMeta>('meta')!.options.deckSet).toBe(deckSet ?? 'core45');
    }
  });

  it('production ignores the test setup: always the core decks', () => {
    const h = harness({ testMode: false });
    const c = new FakeConn('c');
    h.room.connect(c, { kind: 'creator', code: 'DKPR' });
    h.room.message(c, msg({ t: 'create', side: 'corp', test: { seed: 3, actions: [], deckSet: 'starter' } }));
    expect(h.store.get<GameState>('state')!.options).toEqual(ONLINE_OPTIONS);
    expect(h.store.get<GameState>('state')!.players.runner.identity).toBe('r13');
  });
});
