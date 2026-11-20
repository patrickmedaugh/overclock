// Sprint 14 E4 (S-14-3, S-14-4 AC1/AC4): the room deals after both players picked a deck.
// Every standard/own mix on both host sides; illegal decks → deck_refused and nothing dealt;
// Leave / resume / restart while picking; restarts mid-game keep the same deal; v1 frames → version.
import { replay, viewFor, type Action, type GameState, type Side } from '@overclock/engine';
import { STANDARD_DECKS } from '@overclock/cards';
import { PING, PROTOCOL_VERSION, type ServerMsg } from '@overclock/protocol';
import { describe, expect, it } from 'vitest';
import { CLOSE_ERROR, CLOSE_NORMAL, LOBBY_TTL_MS, ONLINE_OPTIONS, Room, type RoomMeta } from '../src/room';
import { FakeConn, harness, msg, type Harness } from './fakes';
import { choiceCards, dealtCards, legalOwnDeck, listCards, rng, standardChoice } from './own-decks';

const CODE = 'K7QF';
const V = PROTOCOL_VERSION;
const other = (s: Side): Side => (s === 'corp' ? 'runner' : 'corp');

function creator(h: Harness, room: Room = h.room, name = 'host'): FakeConn {
  const c = new FakeConn(name);
  room.connect(c, { kind: 'creator', code: CODE });
  return c;
}
function player(room: Room, name = 'guest'): FakeConn {
  const c = new FakeConn(name);
  room.connect(c, { kind: 'player' });
  return c;
}
const tokenOf = (c: FakeConn): string => {
  const m = c.msgs.find((x) => x.t === 'seated');
  if (m?.t !== 'seated') throw new Error('not seated');
  return m.token;
};
const meta = (h: Harness) => h.store.get<RoomMeta>('meta')!;
const state = (h: Harness) => h.store.get<GameState>('state');

/** Host creates (with `hostDeck` if given) and a guest joins; returns both sockets (messages taken). */
function lobbyWithGuest(h: Harness, hostSide: Side, hostDeck?: object, test?: object) {
  const host = creator(h);
  h.room.message(host, msg({ t: 'create', side: hostSide, ...(hostDeck ? { deck: hostDeck } : {}), ...(test ? { test } : {}) }));
  const guest = player(h.room);
  h.room.message(guest, msg({ t: 'join' }));
  return { host, guest };
}

const own = {
  corp: legalOwnDeck(rng(1), 'corp'),
  runner: legalOwnDeck(rng(2), 'runner'),
};

describe('S-14-3: deal after both picks — every standard/own mix', () => {
  const mixes: [string, boolean, boolean][] = [
    ['standard vs standard', false, false],
    ['own host vs standard guest', true, false],
    ['standard host vs own guest', false, true],
    ['own vs own', true, true],
  ];
  for (const hostSide of ['corp', 'runner'] as const) {
    for (const [name, hostOwn, guestOwn] of mixes) {
      it(`${hostSide} host, ${name}: each side is dealt exactly its own pick`, () => {
        const h = harness({ rngSeed: 7 });
        const guestSide = other(hostSide);
        const { host, guest } = lobbyWithGuest(h, hostSide, hostOwn ? own[hostSide] : undefined);
        expect(host.take().map((m) => m.t)).toEqual(['seated', 'lobby', 'lobby']);
        expect(host.msgs[2]).toEqual({ v: V, t: 'lobby', code: CODE, seat: hostSide, picking: true });
        expect(guest.take()).toEqual([
          { v: V, t: 'seated', code: CODE, seat: guestSide, token: tokenOf(guest) },
          { v: V, t: 'choose', seat: guestSide },
        ]);
        expect(state(h)).toBeUndefined(); // nothing dealt before the guest picks
        expect(meta(h).dealt).toBe(false);

        h.room.message(guest, msg(guestOwn ? { t: 'pick', deck: own[guestSide] } : { t: 'pick' }));
        const s = state(h)!;
        expect(meta(h).dealt).toBe(true);
        const ownOf: Record<Side, boolean> = { [hostSide]: hostOwn, [guestSide]: guestOwn } as Record<Side, boolean>;
        for (const side of ['corp', 'runner'] as const) {
          const want = ownOf[side] ? choiceCards(own[side]) : listCards(STANDARD_DECKS[side]);
          expect(dealtCards(s, side), side).toEqual(want);
          expect(dealtCards(s, side)).toHaveLength(want.length);
        }
        // `decks` only for own picks; standard vs standard is byte-identical to a Sprint 13 game.
        const decks = meta(h).options.decks;
        expect(Object.keys(decks ?? {}).sort()).toEqual((['corp', 'runner'] as const).filter((x) => ownOf[x]));
        if (!hostOwn && !guestOwn) {
          expect(meta(h).options).toEqual(ONLINE_OPTIONS);
          expect(JSON.stringify(s)).toBe(JSON.stringify(replay(meta(h).seed, [], ONLINE_OPTIONS).state));
        }
        expect(s.options).toEqual(meta(h).options);
        // Both get a sync of their own view; nothing else.
        expect(host.take()).toEqual([{ v: V, t: 'sync', seq: 0, view: viewFor(hostSide, s), opponent: 'here' }]);
        expect(guest.take()).toEqual([{ v: V, t: 'sync', seq: 0, view: viewFor(guestSide, s), opponent: 'here' }]);
      });
    }
  }

  it('the standard deck sent as counts is dealt as an own deck: the same cards (in canonical order)', () => {
    const a = harness({ rngSeed: 3 });
    const b = harness({ rngSeed: 3 });
    const pa = lobbyWithGuest(a, 'corp');
    a.room.message(pa.guest, msg({ t: 'pick' }));
    const pb = lobbyWithGuest(b, 'corp', standardChoice('corp'));
    b.room.message(pb.guest, msg({ t: 'pick', deck: standardChoice('runner') }));
    for (const side of ['corp', 'runner'] as const) expect(dealtCards(state(b)!, side)).toEqual(dealtCards(state(a)!, side));
    expect(Object.keys(meta(b).options.decks!).sort()).toEqual(['corp', 'runner']);
  });

  it('test mode: the prelude is replayed after the deal, on the own decks', () => {
    const h = harness({ testMode: true });
    const prelude: Action[] = [
      { type: 'gain_credit', player: 'corp' },
      { type: 'draw', player: 'corp' },
    ];
    const { guest } = lobbyWithGuest(h, 'corp', own.corp, { seed: 11, actions: prelude });
    expect(meta(h).testActions).toEqual(prelude);
    h.room.message(guest, msg({ t: 'pick', deck: own.runner }));
    expect(h.room.seq()).toBe(2);
    expect(meta(h).testActions).toBeUndefined();
    expect(state(h)).toEqual(replay(11, prelude, meta(h).options).state);
    expect(dealtCards(replay(11, [], meta(h).options).state, 'corp')).toEqual(choiceCards(own.corp));
  });
});

describe('S-14-4 AC1: illegal decks are refused, nothing is dealt', () => {
  const fourHedge = { ...standardChoice('corp'), cards: { ...standardChoice('corp').cards, c01: 4 } };
  const tooFew = { identity: 'r13', cards: { r01: 3 } };
  const wrongSideId = { identity: 'r13', cards: standardChoice('corp').cards };
  const unknown = { ...standardChoice('runner'), cards: { ...standardChoice('runner').cards, zz9: 1 } };

  it('host: 4 copies → deck_refused (too_many_copies c01), no game, the socket stays open; a legal create then works', () => {
    const h = harness();
    const host = creator(h);
    h.room.message(host, msg({ t: 'create', side: 'corp', deck: fourHedge }));
    const [refused] = host.take();
    expect(refused).toMatchObject({ v: V, t: 'deck_refused' });
    expect((refused as Extract<ServerMsg, { t: 'deck_refused' }>).problems).toContainEqual({ kind: 'too_many_copies', cardId: 'c01', copies: 4 });
    expect(host.closed).toBeNull();
    expect(h.store.data.size).toBe(0);
    expect(h.room.nextWakeAt()).toBeNull();
    // Another phone can't join a game that wasn't made.
    const p = player(h.room);
    h.room.message(p, msg({ t: 'join' }));
    expect(p.take()).toEqual([{ v: V, t: 'error', code: 'no_game' }]);
    // The same socket tries again with a legal deck.
    h.room.message(host, msg({ t: 'create', side: 'corp', deck: own.corp }));
    expect(host.take().map((m) => m.t)).toEqual(['seated', 'lobby']);
  });

  it('host: wrong side identity, too few cards, unknown card → each refused with its problem', () => {
    const cases: [Side, object, object][] = [
      ['corp', wrongSideId, { kind: 'wrong_side', cardId: 'r13' }],
      ['runner', tooFew, { kind: 'too_small', size: 3, min: 45 }],
      ['runner', unknown, { kind: 'unknown_card', cardId: 'zz9' }],
      ['corp', { identity: 'c01', cards: standardChoice('corp').cards }, { kind: 'not_identity', cardId: 'c01' }],
    ];
    for (const [side, deck, problem] of cases) {
      const h = harness();
      const host = creator(h);
      h.room.message(host, msg({ t: 'create', side, deck }));
      const m = host.last();
      expect(m.t).toBe('deck_refused');
      expect((m as Extract<ServerMsg, { t: 'deck_refused' }>).problems).toContainEqual(problem);
      expect(h.store.data.size).toBe(0);
    }
  });

  it('guest: refused only to the guest, nothing dealt, host hears nothing; picking again with a legal deck deals', () => {
    const h = harness();
    const { host, guest } = lobbyWithGuest(h, 'runner');
    host.take();
    guest.take();
    h.room.message(guest, msg({ t: 'pick', deck: fourHedge }));
    const g = guest.take();
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ t: 'deck_refused' });
    expect(host.take()).toEqual([]);
    expect(state(h)).toBeUndefined();
    expect(meta(h).dealt).toBe(false);
    expect(guest.closed).toBeNull();
    // A Runner deck for the Corp seat is refused too.
    h.room.message(guest, msg({ t: 'pick', deck: own.runner }));
    expect((guest.take()[0] as Extract<ServerMsg, { t: 'deck_refused' }>).problems).toContainEqual({ kind: 'wrong_side', cardId: 'r13' });
    h.room.message(guest, msg({ t: 'pick', deck: own.corp }));
    expect(guest.take().map((m) => m.t)).toEqual(['sync']);
    expect(host.take().map((m) => m.t)).toEqual(['sync']);
    expect(dealtCards(state(h)!, 'corp')).toEqual(choiceCards(own.corp));
  });

  it('a malformed deck (bad counts) is a bad_message, not a deal', () => {
    const h = harness();
    const { guest } = lobbyWithGuest(h, 'corp');
    guest.take();
    h.room.message(guest, msg({ t: 'pick', deck: { identity: 'r13', cards: { r01: 1.5 } } }));
    expect(guest.take()).toEqual([{ v: V, t: 'error', code: 'bad_message' }]);
    expect(state(h)).toBeUndefined();
  });

  it('pick is only for the guest, only before the deal; act before the deal is refused', () => {
    const h = harness();
    const host = creator(h);
    h.room.message(host, msg({ t: 'create', side: 'corp' }));
    host.take();
    h.room.message(host, msg({ t: 'pick' }));
    expect(host.take()).toEqual([{ v: V, t: 'error', code: 'bad_message' }]);
    const stranger = player(h.room, 'stranger');
    h.room.message(stranger, msg({ t: 'pick' }));
    expect(stranger.take()).toEqual([{ v: V, t: 'error', code: 'bad_message' }]);
    const guest = player(h.room);
    h.room.message(guest, msg({ t: 'join' }));
    guest.take();
    h.room.message(guest, msg({ t: 'act', id: 1, action: { type: 'gain_credit', player: 'runner' } }));
    h.room.message(host, msg({ t: 'act', id: 1, action: { type: 'gain_credit', player: 'corp' } }));
    expect(guest.take()).toEqual([{ v: V, t: 'error', code: 'bad_message' }]);
    expect(host.take()).toEqual([{ v: V, t: 'lobby', code: CODE, seat: 'corp', picking: true }, { v: V, t: 'error', code: 'bad_message' }]);
    h.room.message(guest, msg({ t: 'pick' }));
    guest.take();
    h.room.message(guest, msg({ t: 'pick', deck: own.runner }));
    expect(guest.take()).toEqual([{ v: V, t: 'error', code: 'bad_message' }]);
    expect(dealtCards(state(h)!, 'runner')).toEqual(listCards(STANDARD_DECKS.runner));
  });
});

describe('S-14-3: Leave, resume and restart while picking', () => {
  it('guest leaves while picking: the seat is free again, the host is back in the plain lobby; a new friend can join', () => {
    const h = harness();
    const { host, guest } = lobbyWithGuest(h, 'corp', own.corp);
    host.take();
    guest.take();
    h.room.message(guest, msg({ t: 'leave' }));
    expect(guest.closed).toEqual({ code: CLOSE_NORMAL, reason: 'left' });
    expect(host.take()).toEqual([{ v: V, t: 'lobby', code: CODE, seat: 'corp' }]);
    expect(meta(h).tokenHashes.runner).toBeUndefined();
    // The old guest's token no longer works.
    const back = player(h.room, 'back');
    h.room.message(back, msg({ t: 'resume', token: tokenOf(guest), since: 0 }));
    expect(back.take()).toEqual([{ v: V, t: 'error', code: 'bad_token' }]);
    const friend = player(h.room, 'friend');
    h.room.message(friend, msg({ t: 'join' }));
    h.room.message(friend, msg({ t: 'pick', deck: own.runner }));
    expect(friend.take().map((m) => m.t)).toEqual(['seated', 'choose', 'sync']);
    expect(dealtCards(state(h)!, 'corp')).toEqual(choiceCards(own.corp));
  });

  it('host leaves while the guest picks: the room closes; the guest hears no_game; storage is wiped', () => {
    const h = harness();
    const { host, guest } = lobbyWithGuest(h, 'runner');
    guest.take();
    h.room.message(host, msg({ t: 'leave' }));
    expect(host.closed).toEqual({ code: CLOSE_NORMAL, reason: 'left' });
    expect(guest.take()).toEqual([{ v: V, t: 'error', code: 'no_game' }]);
    expect(guest.closed).toEqual({ code: CLOSE_ERROR, reason: 'no_game' });
    expect(h.store.data.size).toBe(0);
    expect(h.room.canCreate()).toBe(true);
  });

  it('resume while picking: the guest is asked to choose again, the host waits (picking), before anyone joined: plain lobby', () => {
    const h = harness();
    const host = creator(h);
    h.room.message(host, msg({ t: 'create', side: 'corp', deck: own.corp }));
    h.room.disconnect(host);
    const hostBack = player(h.room, 'host back');
    h.room.message(hostBack, msg({ t: 'resume', token: tokenOf(host), since: 0 }));
    expect(hostBack.take()).toEqual([{ v: V, t: 'lobby', code: CODE, seat: 'corp' }]);
    const guest = player(h.room);
    h.room.message(guest, msg({ t: 'join' }));
    h.room.disconnect(guest);
    h.room.disconnect(hostBack);
    const g2 = player(h.room, 'guest back');
    h.room.message(g2, msg({ t: 'resume', token: tokenOf(guest), since: 0 }));
    expect(g2.take()).toEqual([{ v: V, t: 'choose', seat: 'runner' }]);
    const h2 = player(h.room, 'host again');
    h.room.message(h2, msg({ t: 'resume', token: tokenOf(host), since: 0 }));
    expect(h2.take()).toEqual([{ v: V, t: 'lobby', code: CODE, seat: 'corp', picking: true }]);
    h.room.message(g2, msg({ t: 'pick', deck: own.runner }));
    expect(g2.take().map((m) => m.t)).toEqual(['sync']);
    expect(h2.take().map((m) => m.t)).toEqual(['sync']);
  });

  it('the service restarts while the guest picks (another build): the same deal as without the restart', () => {
    const control = harness({ rngSeed: 5 });
    const c = lobbyWithGuest(control, 'corp', own.corp);
    control.room.message(c.guest, msg({ t: 'pick', deck: own.runner }));

    const h = harness({ rngSeed: 5 });
    const { host, guest } = lobbyWithGuest(h, 'corp', own.corp);
    const woke = new Room(h.store, { ...h.deps, build: 'b2' });
    expect(woke.nextWakeAt()).toBe(meta(h).createdAt + LOBBY_TTL_MS);
    const g = player(woke, 'guest back');
    woke.message(g, msg({ t: 'resume', token: tokenOf(guest), since: 0 }));
    expect(g.take()).toEqual([{ v: V, t: 'choose', seat: 'runner' }]);
    const hb = player(woke, 'host back');
    woke.message(hb, msg({ t: 'resume', token: tokenOf(host), since: 0 }));
    hb.take();
    woke.message(g, msg({ t: 'pick', deck: own.runner }));
    expect(state(h)).toEqual(state(control));
    expect(g.take()).toEqual([{ v: V, t: 'sync', seq: 0, view: viewFor('runner', state(h)!), opponent: 'here' }]);
  });

  it('a room nobody finished picking in expires like a lobby', () => {
    const h = harness();
    const { guest } = lobbyWithGuest(h, 'corp');
    guest.take();
    h.clock.t = meta(h).createdAt + LOBBY_TTL_MS;
    h.room.alarm();
    expect(guest.take()).toEqual([{ v: V, t: 'error', code: 'expired' }]);
    expect(h.store.data.size).toBe(0);
  });
});

describe('S-14-3 AC5: own decks survive restarts, reconnects and Leave for now', () => {
  function playing(seed: number) {
    const h = harness({ rngSeed: seed });
    const { host, guest } = lobbyWithGuest(h, 'runner', own.runner);
    h.room.message(guest, msg({ t: 'pick', deck: own.corp }));
    let id = 0;
    // A few moves by whoever may act.
    for (let i = 0; i < 12; i++) {
      const s = state(h)!;
      const who: Side = viewFor('corp', s).legalActions.length > 0 ? 'corp' : 'runner';
      const a = viewFor(who, s).legalActions.find((x) => x.type === 'gain_credit' || x.type === 'draw') ?? viewFor(who, s).legalActions[0]!;
      h.room.message(who === 'runner' ? host : guest, msg({ t: 'act', id: ++id, action: a }));
    }
    host.take();
    guest.take();
    return { h, host, guest, seq: h.room.seq() };
  }

  it('restart mid-game: by snapshot (same build) and by replay (another build) → the same game with the same decks', () => {
    const { h, host, seq } = playing(9);
    expect(seq).toBeGreaterThan(5);
    const before = state(h)!;
    for (const build of ['b1', 'b2']) {
      const woke = new Room(h.store, { ...h.deps, build });
      expect(woke.seq()).toBe(seq);
      expect(state(h)).toEqual(before);
      const back = player(woke, `back ${build}`);
      woke.message(back, msg({ t: 'resume', token: tokenOf(host), since: 0 }));
      expect(back.take()[0]).toEqual({ v: V, t: 'sync', seq, view: viewFor('runner', before), opponent: 'away' });
    }
    expect(replay(meta(h).seed, h.store.list<Action>('a:').map(([, a]) => a), meta(h).options).state).toEqual(before);
    expect(dealtCards(replay(meta(h).seed, [], meta(h).options).state, 'corp')).toEqual(choiceCards(own.corp));
  });

  it('Leave for now and come back: the same board (the client never sends its deck again)', () => {
    const { h, host, seq } = playing(4);
    h.room.message(host, msg({ t: 'leave' }));
    expect(host.closed?.reason).toBe('left');
    const back = player(h.room, 'back');
    h.room.message(back, msg({ t: 'resume', token: tokenOf(host), since: seq }));
    expect(back.take()[0]).toEqual({ v: V, t: 'sync', seq, view: viewFor('runner', state(h)!), opponent: 'here' });
    expect(meta(h).options.decks).toBeDefined();
  });
});

describe('S-14-4 AC4: older apps (protocol v1) are told to update', () => {
  const v1 = (o: object) => JSON.stringify({ v: 1, ...o });

  it('every v1 frame (create, join, resume, pick, act, ping) → error version and close; nothing stored', () => {
    const frames: [string, 'creator' | 'player'][] = [
      [v1({ t: 'create', side: 'corp' }), 'creator'],
      [v1({ t: 'join' }), 'player'],
      [v1({ t: 'resume', token: 'AAAAAAAAAAAAAAAAAAAAAA', since: 0 }), 'player'],
      [v1({ t: 'pick' }), 'player'],
      [v1({ t: 'act', id: 1, action: { type: 'draw', player: 'corp' } }), 'player'],
      ['{"v":1,"t":"ping"}', 'player'],
    ];
    for (const [frame, kind] of frames) {
      const h = harness();
      const c = kind === 'creator' ? creator(h) : player(h.room);
      h.room.message(c, frame);
      expect(c.take(), frame).toEqual([{ v: V, t: 'error', code: 'version' }]);
      expect(c.closed).toEqual({ code: CLOSE_ERROR, reason: 'version' });
      expect(h.store.data.size).toBe(0);
    }
  });

  it('a v1 phone joining a v2 lobby gets version; the lobby stays for a v2 friend', () => {
    const h = harness();
    const host = creator(h);
    h.room.message(host, msg({ t: 'create', side: 'corp' }));
    host.take();
    const old = player(h.room, 'old');
    h.room.message(old, v1({ t: 'join' }));
    expect(old.take()).toEqual([{ v: V, t: 'error', code: 'version' }]);
    expect(host.take()).toEqual([]);
    expect(meta(h).tokenHashes.runner).toBeUndefined();
    const friend = player(h.room, 'friend');
    h.room.message(friend, msg({ t: 'join' }));
    expect(friend.take().map((m) => m.t)).toEqual(['seated', 'choose']);
  });

  it('PING / PONG carry v2', () => {
    expect(PING).toBe('{"v":2,"t":"ping"}');
    expect(V).toBe(2);
  });
});

describe('Rooms made before Sprint 14 (meta without `dealt`) still play', () => {
  it('a pre-update lobby (dealt at create) deals nothing new: join → sync both at once', () => {
    const h = harness();
    const host = creator(h);
    h.room.message(host, msg({ t: 'create', side: 'corp' }));
    const g = player(h.room);
    h.room.message(g, msg({ t: 'join' }));
    h.room.message(g, msg({ t: 'pick' }));
    const s = state(h)!;
    // Make it look like a Sprint 13 lobby: no `dealt`, no guest yet, state already stored.
    const { dealt: _d, ...old } = meta(h);
    delete old.tokenHashes.runner;
    h.store.put('meta', old);
    const woke = new Room(h.store, h.deps);
    const hb = player(woke, 'host back');
    woke.message(hb, msg({ t: 'resume', token: tokenOf(host), since: 0 }));
    expect(hb.take()).toEqual([{ v: V, t: 'lobby', code: CODE, seat: 'corp' }]);
    const guest = player(woke, 'guest2');
    woke.message(guest, msg({ t: 'join' }));
    expect(guest.take().map((m) => m.t)).toEqual(['seated', 'sync']);
    expect(hb.take()).toEqual([{ v: V, t: 'sync', seq: 0, view: viewFor('corp', s), opponent: 'here' }]);
  });
});
