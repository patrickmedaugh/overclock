// QA Sprint 8 (written by QA, not the developers): the online room on the core decks.
// - Every frame each device gets equals that seat's projection of the true game (view + events),
//   over random production-rules games biased to the Sprint 8 moves (choose, Ram breaks, activate, rez).
// - The Runner's frames never name a face-down Corp card; the Corp's frames never name a Grip card;
//   during an in-run choice only the deciding seat gets options (S-08-7 online, hidden info).
// - Rototurret / Sacrificial Construct through the sockets from planner preludes: the frames during
//   trash_target and prevent_trash carry exactly the choice, nothing hidden.
// - Production ignores a test `deckSet`: a live game is always the core decks with identities.
import { apply, legalActions, viewEvents, viewFor, waitingOn, type Action, type GameEvent, type GameState, type Side } from '@overclock/engine';
import { planToStep } from '@overclock/match/testing';
import type { ServerMsg } from '@overclock/protocol';
import { describe, expect, it } from 'vitest';
import { ONLINE_OPTIONS } from '../src/room';
import { FakeConn, harness, msg, type Harness } from './fakes';
import { prng } from './plans';

const CODE = 'QA88';
type Update = Extract<ServerMsg, { t: 'update' }>;

function seatedGame(h: Harness, hostSide: Side, test?: object) {
  const host = new FakeConn('host');
  h.room.connect(host, { kind: 'creator', code: CODE });
  h.room.message(host, msg({ t: 'create', side: hostSide, ...(test ? { test } : {}) }));
  const guest = new FakeConn('guest');
  h.room.connect(guest, { kind: 'player' });
  h.room.message(guest, msg({ t: 'join' }));
  return (hostSide === 'corp' ? { corp: host, runner: guest } : { corp: guest, runner: host }) as Record<Side, FakeConn>;
}

/** Hidden-information checks on one seat's frames, given the true state after them. */
function checkFrames(side: Side, ups: Update[], state: GameState, where: string): void {
  const down = new Set(state.servers.flatMap((sv) => [...sv.ice, ...sv.content]).filter((c) => !c.rezzed).map((c) => c.uid));
  const grip = new Set(state.players.runner.hand);
  for (const u of ups) {
    const raw = JSON.stringify(u);
    expect(raw, `${where}: no secret fields`).not.toMatch(/"(seed|rng|deck|installedThisTurn)"\s*:/);
    if (side === 'runner') {
      expect(u.view.players.corp.hand, where).toBeNull();
      for (const sv of u.view.corpServers) for (const c of [...sv.ice, ...sv.content]) if (down.has(c.uid)) expect(c.cardId, where).toBeNull();
      for (const e of u.events) {
        const uid = (e as { uid?: string }).uid;
        if (e.type !== 'card_accessed' && uid && down.has(uid)) expect((e as { cardId?: string | null }).cardId ?? null, `${where}: ${JSON.stringify(e)}`).toBeNull();
      }
      for (const k of Object.keys(u.view.installedOptions)) expect(state.rig.some((c) => c.uid === k), where).toBe(true);
    } else {
      expect(u.view.players.runner.hand, where).toBeNull();
      // Runner draws reach the Corp without a card id.
      for (const e of u.events) if (e.type === 'card_drawn' && e.player === 'runner') expect(e.cardId, where).toBeUndefined();
      for (const k of Object.keys(u.view.installedOptions)) expect(state.rig.some((c) => c.uid === k), `${where}: Corp option on a rig card`).toBe(false);
      void grip;
    }
    // In-run choice: options only for the deciding seat; the run stays visible to both.
    if (u.view.choice && u.view.choice.kind !== 'free_rez') {
      expect(u.view.run, `${where}: run kept during ${u.view.choice.kind}`).not.toBeNull();
      if (u.view.choice.waitingOn !== side) expect(u.view.choice.options, where).toEqual([]);
      else expect(u.view.choice.options.length, where).toBeGreaterThan(0);
    }
  }
}

const S8 = new Set(['choose', 'activate', 'rez', 'use_ability', 'install', 'run', 'play']);

describe("QA S-08 online: every frame is exactly the seat's projection on the core decks", () => {
  it('random production-rules games through the room: views and events match; nothing hidden leaks', () => {
    const tally = { games: 0, updates: 0, identities: 0, hb: 0, kate: 0, brain: 0, adonis: 0, melange: 0, choices: 0, ramSubs: 0 };
    for (let game = 1; game <= 16; game++) {
      const pick = prng(game * 977 + 5);
      const h = harness({ rngSeed: game * 41 });
      const conns = seatedGame(h, game % 2 ? 'runner' : 'corp');
      let state = h.store.get<GameState>('state')!;
      expect(state.options).toEqual(ONLINE_OPTIONS);
      expect(state.players.corp.identity).toBe('c13');
      expect(state.players.runner.identity).toBe('r13');
      for (const side of ['corp', 'runner'] as const) {
        const sync = conns[side].take().find((m) => m.t === 'sync' || m.t === 'update') as { view?: { players: { corp: { identity: unknown }; runner: { identity: unknown } } } } | undefined;
        if (sync?.view) {
          expect(sync.view.players.corp.identity).toEqual({ uid: 'id:corp', cardId: 'c13' });
          expect(sync.view.players.runner.identity).toEqual({ uid: 'id:runner', cardId: 'r13' });
          tally.identities++;
        }
      }
      for (let i = 0; i < 500 && state.phase !== 'over'; i++) {
        const seat = waitingOn(state)!;
        const legal = legalActions(state, seat);
        const s8 = legal.filter((a) => S8.has(a.type));
        const a: Action = s8.length > 0 && pick(4) !== 0 ? s8[pick(s8.length)]! : legal[pick(legal.length)]!;
        h.room.message(conns[seat], msg({ t: 'act', id: i + 1, action: a }));
        const r = apply(state, a);
        state = r.state;
        let events: GameEvent[] = [...r.events];
        // The room may auto-answer an approach where the Corp's only move is Don't rez (after a delay).
        const at = h.room.nextWakeAt();
        if (at !== null && at - h.clock.t <= 2400) {
          h.clock.t = at;
          const seq = h.room.seq();
          h.room.alarm();
          if (h.room.seq() > seq) {
            const p = apply(state, { type: 'pass', player: 'corp' });
            state = p.state;
            events = [...events, ...p.events];
          }
        }
        for (const side of ['corp', 'runner'] as const) {
          const ups = conns[side].take().filter((m): m is Update => m.t === 'update');
          expect(ups.length, `${side} updates after ${JSON.stringify(a)}`).toBeGreaterThanOrEqual(1);
          expect(ups.at(-1)!.view, `${side} view`).toEqual(viewFor(side, state));
          expect(ups.flatMap((u) => u.events), `${side} events`).toEqual(viewEvents(side, events));
          checkFrames(side, ups, state, `game ${game} step ${i} ${side}`);
          tally.updates += ups.length;
        }
        for (const e of events) {
          if (e.type === 'ability_triggered' && e.uid === 'id:corp') tally.hb++;
          if (e.type === 'ability_triggered' && e.uid === 'id:runner') tally.kate++;
          if (e.type === 'brain_damage') tally.brain++;
          if (e.type === 'ability_triggered' && e.cardId === 'c14') tally.adonis++;
          if (e.type === 'choice_opened' && e.kind !== 'free_rez') tally.choices++;
        }
        if (a.type === 'activate' && a.player === 'corp') tally.melange++;
        if (a.type === 'use_ability' && (a as { subs?: number[] }).subs) tally.ramSubs++;
      }
      expect(h.store.get<GameState>('state')).toEqual(state);
      tally.games++;
    }
    console.log('QA sprint 8 room sweep', JSON.stringify(tally));
    for (const k of ['hb', 'kate', 'brain', 'adonis'] as const) expect(tally[k], k).toBeGreaterThan(0);
  }, 120_000);
});

describe('QA S-08-7 online: Rototurret and Sacrificial Construct frames', () => {
  // Seeds with Sacrificial Construct installed at the goal (README list) and without (1, 3).
  for (const seed of [2, 7, 9, 1, 3]) {
    it(`seed ${seed}: the Corp picks on its device, the Runner decides on his; every frame exact and clean`, () => {
      const plan = planToStep(seed, 'rototurret_two_programs', 1500, { rezWindow: ONLINE_OPTIONS.rezWindow });
      const h = harness({ testMode: true });
      const conns = seatedGame(h, 'runner', { seed, actions: plan.actions });
      let state = h.store.get<GameState>('state')!;
      expect(state.run?.step).toBe('encounter');
      for (const c of Object.values(conns)) c.take();
      let nextId = 0;
      const send = (a: Action) => {
        h.room.message(conns[a.player], msg({ t: 'act', id: ++nextId, action: a }));
        const r = apply(state, a);
        expect(r.events.some((e) => e.type === 'action_rejected'), JSON.stringify(a)).toBe(false);
        state = r.state;
        const out = {} as Record<Side, Update[]>;
        for (const side of ['corp', 'runner'] as const) {
          const ups = conns[side].take().filter((m): m is Update => m.t === 'update');
          expect(ups.at(-1)!.view).toEqual(viewFor(side, state));
          expect(ups.flatMap((u) => u.events)).toEqual(viewEvents(side, r.events));
          checkFrames(side, ups, state, `seed ${seed} ${a.type} ${side}`);
          out[side] = ups;
        }
        return out;
      };
      // Runner lets the subroutines fire.
      let f = send({ type: 'pass', player: 'runner' });
      expect(state.choice?.kind).toBe('trash_target');
      const programs = plan.info['programs']!.split(',');
      // Corp frame: one choose per program; Runner frame: no options, sees the ICE name (rezzed).
      expect(f.corp.at(-1)!.view.choice!.options.map((o) => (o.action as { uid: string }).uid)).toEqual(programs);
      expect(f.runner.at(-1)!.view.choice).toMatchObject({ kind: 'trash_target', waitingOn: 'corp', cardId: 'c19', options: [] });
      // A Runner move now is refused, and only to him.
      h.room.message(conns.runner, msg({ t: 'act', id: 999, action: { type: 'pass', player: 'runner' } }));
      const rej = conns.runner.take();
      expect(rej.map((m) => m.t)).toEqual(['rejected']);
      expect((rej[0] as Extract<ServerMsg, { t: 'rejected' }>).events).toContainEqual({ type: 'action_rejected', reason: 'not_your_turn' });
      expect(conns.corp.take().filter((m) => m.t === 'update')).toEqual([]);
      f = send({ type: 'choose', player: 'corp', uid: programs[0]! });
      if (plan.info['construct']) {
        expect(state.choice?.kind).toBe('prevent_trash');
        expect(f.runner.at(-1)!.view.choice!.target).toBe(programs[0]);
        expect(f.runner.at(-1)!.view.choice!.options.map((o) => o.action.type)).toEqual(['choose', 'pass']);
        expect(f.corp.at(-1)!.view.choice).toMatchObject({ kind: 'prevent_trash', waitingOn: 'runner', options: [] });
        f = send({ type: 'choose', player: 'runner', uid: plan.info['construct'] });
        for (const side of ['corp', 'runner'] as const) {
          const ev = f[side].flatMap((u) => u.events);
          expect(ev.some((e) => e.type === 'trash_prevented')).toBe(true);
          expect(f[side].at(-1)!.view.rig.some((c) => c.uid === programs[0])).toBe(true);
        }
      } else {
        for (const side of ['corp', 'runner'] as const) expect(f[side].flatMap((u) => u.events)).toContainEqual({ type: 'rig_card_trashed', uid: programs[0], cardId: expect.any(String) });
      }
      expect(state.choice).toBeNull();
    });
  }
});

describe('QA S-08-5 online: production rooms always deal the core decks', () => {
  it('a create carrying test.deckSet "starter" without test mode still gets the 30-card decks and identities', () => {
    const h = harness({ testMode: false });
    seatedGame(h, 'corp', { seed: 5, actions: [], deckSet: 'starter' });
    const s = h.store.get<GameState>('state')!;
    expect(s.options).toEqual(ONLINE_OPTIONS);
    expect(s.players.corp.identity).toBe('c13');
    expect(s.players.corp.hand.length + s.players.corp.deck.length).toBe(30);
    expect(s.players.runner.hand.length + s.players.runner.deck.length).toBe(30);
  });
});

describe('QA S-08-3/S-08-4 online: Viktor and Battering Ram through the sockets (planner preludes)', () => {
  function room(seed: number, goal: 'viktor_encounter' | 'heimdall_ram_encounter') {
    const plan = planToStep(seed, goal, 1500, { rezWindow: ONLINE_OPTIONS.rezWindow });
    const h = harness({ testMode: true });
    const conns = seatedGame(h, 'corp', { seed, actions: plan.actions });
    let state = h.store.get<GameState>('state')!;
    for (const c of Object.values(conns)) c.take();
    let id = 0;
    const send = (a: Action) => {
      h.room.message(conns[a.player], msg({ t: 'act', id: ++id, action: a }));
      const r = apply(state, a);
      expect(r.events.some((e) => e.type === 'action_rejected'), JSON.stringify(a)).toBe(false);
      state = r.state;
      const out = {} as Record<Side, Update>;
      for (const side of ['corp', 'runner'] as const) {
        const ups = conns[side].take().filter((m): m is Update => m.t === 'update');
        expect(ups.at(-1)!.view).toEqual(viewFor(side, state));
        expect(ups.flatMap((u) => u.events)).toEqual(viewEvents(side, r.events));
        checkFrames(side, ups, state, `${goal} ${a.type} ${side}`);
        out[side] = ups.at(-1)!;
      }
      return out;
    };
    return { plan, send, state: () => state };
  }

  for (const seed of [1, 42]) {
    it(`seed ${seed}: Viktor fires: both devices show Hand max 4 and the same lost card face up in the Heap`, () => {
      const { send, state } = room(seed, 'viktor_encounter');
      const heap = state().players.runner.discard.length;
      const f = send({ type: 'pass', player: 'runner' });
      const lost = state().players.runner.discard.at(-1)!.cardId;
      expect(state().players.runner.discard.length).toBe(heap + 1);
      for (const side of ['corp', 'runner'] as const) {
        expect(f[side].view.players.runner.maxHandSize).toBe(4);
        expect(f[side].view.players.runner.discard.at(-1)).toBe(lost);
        expect(f[side].events).toContainEqual({ type: 'brain_damage', amount: 1, cardIds: [lost], maxHandSize: 4 });
      }
    });

    it(`seed ${seed}: Battering Ram pumps 3 and breaks subroutines 0 and 2 for one payment; both devices agree`, () => {
      const { plan, send, state } = room(seed, 'heimdall_ram_encounter');
      const ram = plan.info['breakerUid']!;
      for (let i = 0; i < 3; i++) send({ type: 'use_ability', player: 'runner', uid: ram, ability: 1 } as Action);
      const credits = state().players.runner.credits;
      const f = send({ type: 'use_ability', player: 'runner', uid: ram, ability: 0, subs: [0, 2] } as Action);
      expect(state().players.runner.credits).toBe(credits - 2);
      for (const side of ['corp', 'runner'] as const) {
        expect(f[side].events.filter((e) => e.type === 'subroutine_broken').map((e) => (e as { sub: number }).sub)).toEqual([0, 2]);
        expect(f[side].view.run!.ice!.subroutines.map((s) => s.broken)).toEqual([true, false, true]);
      }
    });
  }
});
