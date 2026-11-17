// Sprint 7 E2: `leave` closes a lobby nobody joined (S-07-1 AC6, QA-S6-1); a stored game whose
// log no longer replays under this build's rules is expired, never silently changed.
import { readFileSync } from 'node:fs';
import { replay, RULES_VERSION, type Action } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { CLOSE_ERROR, CLOSE_NORMAL, ONLINE_OPTIONS, Room, type RoomMeta } from '../src/room';
import { sha256Hex } from '../src/hash';
import { FakeConn, harness, msg, type Harness } from './fakes';

const CODE = 'K7QF';

function creator(h: Harness, room: Room = h.room): FakeConn {
  const c = new FakeConn('host');
  room.connect(c, { kind: 'creator', code: CODE });
  return c;
}
function player(h: Harness, room: Room = h.room, name = 'guest'): FakeConn {
  const c = new FakeConn(name);
  room.connect(c, { kind: 'player' });
  return c;
}
const tokenOf = (c: FakeConn): string => {
  const m = c.msgs.find((x) => x.t === 'seated');
  if (m?.t !== 'seated') throw new Error('not seated');
  return m.token;
};

describe('leave (S-07-1 AC6)', () => {
  it('in a lobby nobody joined: the room closes (socket closed normally, storage wiped); the code then answers no_game', () => {
    const h = harness();
    const host = creator(h);
    h.room.message(host, msg({ t: 'create', side: 'corp' }));
    host.take();
    expect(h.store.data.size).toBeGreaterThan(0);
    h.room.message(host, msg({ t: 'leave' }));
    expect(host.take()).toEqual([]);
    expect(host.closed).toEqual({ code: CLOSE_NORMAL, reason: 'left' });
    expect(h.store.data.size).toBe(0);
    expect(h.room.nextWakeAt()).toBeNull();
    expect(h.room.canCreate()).toBe(true);
    // Another phone types the code.
    const late = player(h);
    h.room.message(late, msg({ t: 'join' }));
    expect(late.take()).toEqual([{ v: 1, t: 'error', code: 'no_game' }]);
    expect(late.closed?.code).toBe(CLOSE_ERROR);
    // The host's stored seat is gone too.
    const back = player(h, h.room, 'host-again');
    h.room.message(back, msg({ t: 'resume', token: tokenOf(host), since: 0 }));
    expect(back.take()).toEqual([{ v: 1, t: 'error', code: 'no_game' }]);
  });

  it('the closing socket hears nothing more (the close event after it is harmless)', () => {
    const h = harness();
    const host = creator(h);
    h.room.message(host, msg({ t: 'create', side: 'runner' }));
    h.room.message(host, msg({ t: 'leave' }));
    h.room.disconnect(host);
    expect(h.room.canCreate()).toBe(true);
    // The code can be used for a new game.
    const again = creator(h);
    h.room.message(again, msg({ t: 'create', side: 'corp' }));
    expect(again.take().map((m) => m.t)).toEqual(['seated', 'lobby']);
  });

  it('in a started game: Sprint 11 leave for now (the game is kept; see sprint11-room.test.ts)', () => {
    const h = harness();
    const host = creator(h);
    h.room.message(host, msg({ t: 'create', side: 'corp' }));
    const guest = player(h);
    h.room.message(guest, msg({ t: 'join' }));
    host.take();
    guest.take();
    h.room.message(guest, msg({ t: 'leave' }));
    expect(guest.take()).toEqual([]);
    expect(guest.closed).toEqual({ code: CLOSE_NORMAL, reason: 'left' });
    expect(host.closed).toBeNull();
    h.room.message(host, msg({ t: 'act', id: 1, action: { type: 'gain_credit', player: 'corp' } }));
    expect(host.take().at(-1)).toMatchObject({ t: 'update', seq: 1, ack: 1 });
  });

  it('from a socket without a seat (before join / before create): bad_message, nothing closes', () => {
    const h = harness();
    const host = creator(h);
    h.room.message(host, msg({ t: 'leave' }));
    expect(host.take()).toEqual([{ v: 1, t: 'error', code: 'bad_message' }]);
    h.room.message(host, msg({ t: 'create', side: 'corp' }));
    const visitor = player(h);
    h.room.message(visitor, msg({ t: 'leave' }));
    expect(visitor.take()).toEqual([{ v: 1, t: 'error', code: 'bad_message' }]);
    expect(h.store.get('meta')).toBeDefined();
  });
});

describe('restore by replay that diverges (rules changed under a stored game)', () => {
  // A real Sprint 6 online log: under Sprint 7 rules its emptied remote1 is removed, so the
  // log's later "run on remote1" is refused on replay.
  const LOG = JSON.parse(readFileSync(new URL('./fixtures/sprint06-log-diverges.json', import.meta.url), 'utf8')) as {
    seed: number;
    actions: Action[];
  };
  const TOKENS = { corp: 'corp-token-aaaaaaaaaaaa', runner: 'runner-token-aaaaaaaaaa' };

  function storedOldGame(h: Harness): void {
    const meta: RoomMeta = {
      code: CODE,
      seed: LOG.seed,
      hostSide: 'corp',
      tokenHashes: { corp: sha256Hex(TOKENS.corp), runner: sha256Hex(TOKENS.runner) },
      options: ONLINE_OPTIONS,
      createdAt: h.clock.t,
      lastActive: h.clock.t,
      build: 'sprint6',
    };
    h.store.put('meta', meta);
    LOG.actions.forEach((a, i) => h.store.put(`a:${String(i + 1).padStart(6, '0')}`, a));
    h.store.put('state', { stale: true });
  }

  it('the fixture really diverges under these rules (Sprint 6 log on the starter decks; RULES_VERSION 4 since Sprint 10)', () => {
    expect(RULES_VERSION).toBe(4);
    expect(replay(LOG.seed, LOG.actions, { ...ONLINE_OPTIONS, deckSet: 'starter' }).events.some((e) => e.type === 'action_rejected')).toBe(true);
  });

  it('another build wakes the room: the game is expired (storage wiped), reattached seats get expired and close', () => {
    const h = harness();
    storedOldGame(h);
    const woke = new Room(h.store, h.deps); // build b1 ≠ sprint6: restore by replay
    expect(h.store.data.size).toBe(0);
    expect(woke.seq()).toBe(0);
    expect(woke.nextWakeAt()).toBeNull();
    const host = new FakeConn('host');
    const guest = new FakeConn('guest');
    woke.reattach(host, { kind: 'seat', seat: 'corp' });
    woke.reattach(guest, { kind: 'seat', seat: 'runner' });
    for (const c of [host, guest]) {
      expect(c.take()).toEqual([{ v: 1, t: 'error', code: 'expired' }]);
      expect(c.closed).toEqual({ code: CLOSE_ERROR, reason: 'expired' });
    }
  });

  it('a phone resuming or joining later hears expired; the code is free for a new game, which plays normally', () => {
    const h = harness();
    storedOldGame(h);
    const woke = new Room(h.store, h.deps);
    const back = player(h, woke, 'back');
    woke.message(back, msg({ t: 'resume', token: TOKENS.runner, since: 12 }));
    expect(back.take()).toEqual([{ v: 1, t: 'error', code: 'expired' }]);
    const late = player(h, woke, 'late');
    woke.message(late, msg({ t: 'join' }));
    expect(late.take()).toEqual([{ v: 1, t: 'error', code: 'expired' }]);
    expect(woke.canCreate()).toBe(true);
    const host = creator(h, woke);
    woke.message(host, msg({ t: 'create', side: 'corp' }));
    expect(host.take().map((m) => m.t)).toEqual(['seated', 'lobby']);
    const guest = player(h, woke);
    woke.message(guest, msg({ t: 'join' }));
    expect(guest.take().map((m) => m.t)).toEqual(['seated', 'sync']);
  });

  it('a log that still replays is restored as before (no expiry)', () => {
    const h = harness({ testMode: true });
    const host = creator(h);
    const prelude: Action[] = [
      { type: 'gain_credit', player: 'corp' },
      { type: 'gain_credit', player: 'corp' },
    ];
    h.room.message(host, msg({ t: 'create', side: 'corp', test: { seed: 9, actions: prelude } }));
    const woke = new Room(h.store, { ...h.deps, build: 'b2' });
    expect(woke.seq()).toBe(2);
    expect(h.store.get<RoomMeta>('meta')!.build).toBe('b2');
  });

  it('a game created under another RULES_VERSION is expired on restore by replay, even when its log replays', () => {
    const h = harness({ testMode: true });
    const host = creator(h);
    h.room.message(host, msg({ t: 'create', side: 'corp', test: { seed: 9, actions: [{ type: 'gain_credit', player: 'corp' }] } }));
    expect(h.store.get<RoomMeta>('meta')!.rulesVersion).toBe(RULES_VERSION);
    // Same build: the snapshot is trusted, nothing is replayed.
    expect(new Room(h.store, h.deps).seq()).toBe(1);
    // Another build: a game whose stored version differs is expired.
    h.store.put('meta', { ...h.store.get<RoomMeta>('meta')!, rulesVersion: RULES_VERSION + 1 });
    const woke = new Room(h.store, { ...h.deps, build: 'b2' });
    expect(h.store.data.size).toBe(0);
    expect(woke.seq()).toBe(0);
    const back = player(h, woke, 'back');
    woke.message(back, msg({ t: 'resume', token: tokenOf(host), since: 0 }));
    expect(back.take()).toEqual([{ v: 1, t: 'error', code: 'expired' }]);
  });

  it('a room stored without a version (made before it was stored) counts as version 1', () => {
    const h = harness({ testMode: true });
    const host = creator(h);
    h.room.message(host, msg({ t: 'create', side: 'corp', test: { seed: 9, actions: [{ type: 'gain_credit', player: 'corp' }] } }));
    const { rulesVersion: _drop, ...old } = h.store.get<RoomMeta>('meta')!;
    h.store.put('meta', old);
    const woke = new Room(h.store, { ...h.deps, build: 'b2' });
    expect(woke.seq()).toBe(RULES_VERSION === 1 ? 1 : 0);
  });
});
