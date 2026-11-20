// QA Sprint 7 (written by QA, not the developers): the online room with the Sprint 7 cards.
// - Every frame each phone gets equals that seat's projection of the true game (view + events),
//   over random games biased to the new actions (rez assets, card abilities, Bank Job, Ice Wall).
// - The Runner's frames never name a face-down Corp card (PAD Campaign / Akitaro installed face down).
// - S-07-1 AC6: Back on the waiting screen ("leave") — another phone typing the code gets no_game;
//   a leave from the joiner of a started game does not close it.
import { apply, legalActions, viewEvents, viewFor, waitingOn, type Action, type GameEvent, type GameState, type Side } from '@overclock/engine';
import type { ServerMsg } from '@overclock/protocol';
import { describe, expect, it } from 'vitest';
import { ONLINE_OPTIONS } from '../src/room';
import { FakeConn, harness, msg, type Harness } from './fakes';
import { prng } from './plans';

const CODE = 'QA77';

function seatedGame(h: Harness, hostSide: Side) {
  const host = new FakeConn('host');
  h.room.connect(host, { kind: 'creator', code: CODE });
  h.room.message(host, msg({ t: 'create', side: hostSide }));
  const guest = new FakeConn('guest');
  h.room.connect(guest, { kind: 'player' });
  h.room.message(guest, msg({ t: 'join' }));
  h.room.message(guest, msg({ t: 'pick' }));
  return (hostSide === 'corp' ? { corp: host, runner: guest } : { corp: guest, runner: host }) as Record<Side, FakeConn>;
}

type Update = Extract<ServerMsg, { t: 'update' }>;

const S7 = new Set(['rez', 'activate', 'advance', 'install', 'run', 'trash']);

describe('QA S-07 online: every frame is exactly the seat\'s projection, with the Sprint 7 cards in play', () => {
  it('random games through the room: view and events of each update match viewFor/viewEvents of the true game; nothing face down leaks', () => {
    const tally = { games: 0, updates: 0, cardRezzed: 0, abilities: 0, hosted: 0, removed: 0, success: 0 };
    // Sprint 12: production games deal 45 cards (one Bank Job in 45): 20 games so a Bank Job success step still shows up.
    for (let game = 1; game <= 20; game++) {
      const pick = prng(game * 131 + 7);
      const h = harness({ rngSeed: game * 29 });
      const conns = seatedGame(h, game % 2 ? 'runner' : 'corp');
      let state = h.store.get<GameState>('state')!;
      expect(state.options).toEqual(ONLINE_OPTIONS);
      for (const side of ['corp', 'runner'] as const) conns[side].take();
      for (let i = 0; i < 450 && state.phase !== 'over'; i++) {
        const seat = waitingOn(state)!;
        const legal = legalActions(state, seat);
        const s7 = legal.filter((a) => S7.has(a.type));
        const a: Action = s7.length > 0 && pick(4) !== 0 ? s7[pick(s7.length)]! : legal[pick(legal.length)]!;
        h.room.message(conns[seat], msg({ t: 'act', id: i + 1, action: a }));
        const r = apply(state, a);
        state = r.state;
        let events: GameEvent[] = [...r.events];
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
          tally.updates += ups.length;
          if (side === 'runner') {
            // No face-down Corp card is named anywhere in the Runner's frames.
            const down = state.servers.flatMap((sv) => [...sv.ice, ...sv.content]).filter((c) => !c.rezzed);
            for (const u of ups) {
              for (const sv of u.view.corpServers) for (const c of [...sv.ice, ...sv.content]) if (down.some((d) => d.uid === c.uid)) expect(c.cardId).toBeNull();
              for (const e of u.events) {
                const uid = (e as { uid?: string }).uid;
                // Sprint 12: card_exposed (Infiltration) names a face-down card publicly, by the rules.
                if (e.type !== 'card_accessed' && e.type !== 'card_exposed' && uid && down.some((d) => d.uid === uid)) expect((e as { cardId?: string | null }).cardId ?? null, JSON.stringify(e)).toBeNull();
              }
              expect(Object.keys(u.view.installedOptions).every((k) => state.rig.some((c) => c.uid === k))).toBe(true);
            }
          }
        }
        for (const e of events) {
          if (e.type === 'card_rezzed') tally.cardRezzed++;
          if (e.type === 'ability_triggered') tally.abilities++;
          if (e.type === 'hosted_credits_changed') tally.hosted++;
          if (e.type === 'server_removed') tally.removed++;
        }
        if (state.run?.step === 'success') tally.success++;
      }
      expect(h.store.get<GameState>('state')).toEqual(state);
      tally.games++;
    }
    console.log('QA sprint 7 room sweep', JSON.stringify(tally));
    for (const k of ['cardRezzed', 'abilities', 'hosted', 'removed', 'success'] as const) expect(tally[k], k).toBeGreaterThan(0);
  }, 60_000);
});

describe('QA S-07-1 AC6: a lobby given up is gone', () => {
  it('create, leave, then another phone joins: no_game; the leaver\'s token is dead too', () => {
    const h = harness();
    const host = new FakeConn('host');
    h.room.connect(host, { kind: 'creator', code: CODE });
    h.room.message(host, msg({ t: 'create', side: 'runner' }));
    const token = (host.msgs.find((m) => m.t === 'seated') as Extract<ServerMsg, { t: 'seated' }>).token;
    h.room.message(host, msg({ t: 'leave' }));
    expect(host.closed).not.toBeNull();
    const other = new FakeConn('other');
    h.room.connect(other, { kind: 'player' });
    h.room.message(other, msg({ t: 'join' }));
    h.room.message(other, msg({ t: 'pick' }));
    expect(other.msgs).toEqual([{ v: 2, t: 'error', code: 'no_game' }]);
    const again = new FakeConn('again');
    h.room.connect(again, { kind: 'player' });
    h.room.message(again, msg({ t: 'resume', token, since: 0 }));
    expect(again.msgs).toEqual([{ v: 2, t: 'error', code: 'no_game' }]);
  });

  it('a socket with no seat cannot close someone else\'s lobby with leave', () => {
    const h = harness();
    const host = new FakeConn('host');
    h.room.connect(host, { kind: 'creator', code: CODE });
    h.room.message(host, msg({ t: 'create', side: 'corp' }));
    const stranger = new FakeConn('stranger');
    h.room.connect(stranger, { kind: 'player' });
    h.room.message(stranger, msg({ t: 'leave' }));
    expect(stranger.msgs.at(-1)).toEqual({ v: 2, t: 'error', code: 'bad_message' });
    // The lobby still takes a joiner.
    const guest = new FakeConn('guest');
    h.room.connect(guest, { kind: 'player' });
    h.room.message(guest, msg({ t: 'join' }));
    h.room.message(guest, msg({ t: 'pick' }));
    expect(guest.msgs.some((m) => m.t === 'sync')).toBe(true);
    expect(host.closed).toBeNull();
  });
});
