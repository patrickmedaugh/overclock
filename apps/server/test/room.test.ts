// Sprint 6 E3: the room (pure game-server logic): create/join/full/resume/bad token/replaced,
// seq and sync on gap, rejections to the submitter only, presence, Corp auto-pass timing,
// cleanup wake-ups, restore by snapshot and by replay.
import { replay, viewFor, type Action, type GameState } from '@overclock/engine';
import { PING, type ServerMsg } from '@overclock/protocol';
import { describe, expect, it } from 'vitest';
import { planToStep } from '@overclock/match/testing';
import {
  AUTO_PASS_MAX_MS,
  AUTO_PASS_MIN_MS,
  CLOSE_ERROR,
  FINISHED_TTL_MS,
  IDLE_TTL_MS,
  LOBBY_TTL_MS,
  ONLINE_OPTIONS,
  Room,
  type RoomMeta,
} from '../src/room';
import { sha256Hex } from '../src/hash';
import { FakeConn, harness, msg, type Harness } from './fakes';
import { corpOnlyPass, planUntil } from './plans';

const CODE = 'K7QF';

function creator(h: Harness, name = 'host'): FakeConn {
  const c = new FakeConn(name);
  h.room.connect(c, { kind: 'creator', code: CODE });
  return c;
}
function player(h: Harness, name = 'guest'): FakeConn {
  const c = new FakeConn(name);
  h.room.connect(c, { kind: 'player' });
  return c;
}
const tokenOf = (c: FakeConn): string => {
  const m = c.msgs.find((x) => x.t === 'seated');
  if (m?.t !== 'seated') throw new Error('not seated');
  return m.token;
};
const meta = (h: Harness) => h.store.get<RoomMeta>('meta')!;
const seed = (h: Harness) => meta(h).seed;
const accepted = (h: Harness) => h.store.list<Action>('a:').map(([, a]) => a);
const truth = (h: Harness): GameState => replay(seed(h), accepted(h), ONLINE_OPTIONS).state;

/** Corp host + Runner guest, both seated, game started. */
function started(h: Harness, test?: { seed: number; actions: Action[] }) {
  const host = creator(h);
  h.room.message(host, msg({ t: 'create', side: 'corp', ...(test ? { test } : {}) }));
  const guest = player(h);
  h.room.message(guest, msg({ t: 'join' }));
  return { host, guest, hostToken: tokenOf(host), guestToken: tokenOf(guest) };
}

describe('create', () => {
  it('seats the starter on the side they picked: seated, then lobby; stores only the token hash', () => {
    const h = harness();
    expect(h.room.canCreate()).toBe(true);
    const host = creator(h);
    expect(h.room.canCreate()).toBe(false); // the creator socket holds the room
    h.room.message(host, msg({ t: 'create', side: 'runner' }));
    const [seated, lobby] = host.take();
    expect(seated).toMatchObject({ t: 'seated', code: CODE, seat: 'runner' });
    const token = tokenOf(host);
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(lobby).toEqual({ v: 1, t: 'lobby', code: CODE, seat: 'runner' });
    expect(host.role).toEqual({ kind: 'seat', seat: 'runner' });
    const m = meta(h);
    expect(m).toMatchObject({ code: CODE, hostSide: 'runner', options: ONLINE_OPTIONS, build: 'b1' });
    expect(m.tokenHashes).toEqual({ runner: sha256Hex(token) });
    expect(JSON.stringify([...h.store.data])).not.toContain(token);
    expect(h.store.get<GameState>('state')!.options).toEqual(ONLINE_OPTIONS);
    expect(h.room.canCreate()).toBe(false);
  });

  it('seed comes from the server randomness, differs between rooms; test setup ignored outside test mode', () => {
    const a = harness({ rngSeed: 1 });
    const b = harness({ rngSeed: 2 });
    for (const h of [a, b]) {
      const c = creator(h);
      h.room.message(c, msg({ t: 'create', side: 'corp', test: { seed: 5, actions: [{ type: 'gain_credit', player: 'corp' }] } }));
    }
    expect(seed(a)).not.toBe(seed(b));
    expect(seed(a)).not.toBe(5);
    expect(accepted(a)).toEqual([]);
  });

  it('test mode: create takes the seed and a prelude (accepted actions only are logged)', () => {
    const h = harness({ testMode: true });
    const c = creator(h);
    const actions: Action[] = [
      { type: 'gain_credit', player: 'corp' },
      { type: 'gain_credit', player: 'runner' }, // rejected: not the Runner's turn
      { type: 'draw', player: 'corp' },
    ];
    h.room.message(c, msg({ t: 'create', side: 'corp', test: { seed: 5, actions } }));
    expect(seed(h)).toBe(5);
    expect(accepted(h)).toEqual([actions[0], actions[2]]);
    expect(h.room.seq()).toBe(2);
    expect(h.store.get<GameState>('state')).toEqual(replay(5, accepted(h), ONLINE_OPTIONS).state);
  });

  it('create on a game socket, or a second create, is a bad_message (socket stays open)', () => {
    const h = harness();
    const p = player(h);
    h.room.message(p, msg({ t: 'create', side: 'corp' }));
    expect(p.take()).toEqual([{ v: 1, t: 'error', code: 'bad_message' }]);
    expect(p.closed).toBeNull();
    const c = creator(h);
    h.room.message(c, msg({ t: 'create', side: 'corp' }));
    c.take();
    h.room.message(c, msg({ t: 'create', side: 'runner' }));
    expect(c.take()).toEqual([{ v: 1, t: 'error', code: 'bad_message' }]);
    expect(meta(h).hostSide).toBe('corp');
  });

  it('a creator socket that closes before create frees the room', () => {
    const h = harness();
    const c = creator(h);
    h.room.disconnect(c);
    expect(h.room.canCreate()).toBe(true);
    expect(h.room.nextWakeAt()).toBeNull();
  });
});

describe('join', () => {
  it('no game with that code: error no_game, socket closed', () => {
    const h = harness();
    const p = player(h);
    h.room.message(p, msg({ t: 'join' }));
    expect(p.take()).toEqual([{ v: 1, t: 'error', code: 'no_game' }]);
    expect(p.closed).toEqual({ code: CLOSE_ERROR, reason: 'no_game' });
  });

  it('the joiner takes the other side; both phones get a sync of their own view (seq 0, opponent here)', () => {
    const h = harness();
    const host = creator(h);
    h.room.message(host, msg({ t: 'create', side: 'corp' }));
    host.take();
    const guest = player(h);
    h.room.message(guest, msg({ t: 'join' }));
    const g = guest.take();
    expect(g[0]).toMatchObject({ t: 'seated', code: CODE, seat: 'runner' });
    const s = truth(h);
    expect(g[1]).toEqual({ v: 1, t: 'sync', seq: 0, view: viewFor('runner', s), opponent: 'here' });
    expect(host.take()).toEqual([{ v: 1, t: 'sync', seq: 0, view: viewFor('corp', s), opponent: 'here' }]);
    expect(meta(h).tokenHashes).toEqual({ corp: sha256Hex(tokenOf(host)), runner: sha256Hex(tokenOf(guest)) });
    expect(tokenOf(guest)).not.toBe(tokenOf(host));
  });

  it('S-06-3 AC4: a third phone gets full and cannot take a seat', () => {
    const h = harness();
    const { host, guest } = started(h);
    host.take();
    guest.take();
    const third = player(h, 'third');
    h.room.message(third, msg({ t: 'join' }));
    expect(third.take()).toEqual([{ v: 1, t: 'error', code: 'full' }]);
    expect(third.closed?.reason).toBe('full');
    // It can't act or resume without a token either.
    const fourth = player(h, 'fourth');
    h.room.message(fourth, msg({ t: 'act', id: 1, action: { type: 'gain_credit', player: 'corp' } }));
    h.room.message(fourth, msg({ t: 'resume', token: 'AAAAAAAAAAAAAAAAAAAAAA', since: 0 }));
    expect(fourth.take()).toEqual([
      { v: 1, t: 'error', code: 'bad_message' },
      { v: 1, t: 'error', code: 'bad_token' },
    ]);
    expect(host.take()).toEqual([]);
    expect(guest.take()).toEqual([]);
    expect(h.room.seq()).toBe(0);
  });
});

describe('act', () => {
  it('accepted: update to both with seq + projected events, ack only to the submitter, 3 rows written', () => {
    const h = harness();
    const { host, guest } = started(h);
    host.take();
    guest.take();
    const writes = h.store.writes;
    h.room.message(host, msg({ t: 'act', id: 41, action: { type: 'draw', player: 'corp' } }));
    expect(h.store.writes - writes).toBe(3);
    const s = truth(h);
    const [hu] = host.take();
    const [gu] = guest.take();
    expect(hu).toMatchObject({ t: 'update', seq: 1, ack: 41, view: viewFor('corp', s) });
    expect(gu).toEqual({ v: 1, t: 'update', seq: 1, view: viewFor('runner', s), events: [{ type: 'card_drawn', player: 'corp' }] });
    expect(hu?.t === 'update' && hu.events[0]?.type === 'card_drawn' && 'cardId' in hu.events[0]).toBe(true);
    expect(accepted(h)).toEqual([{ type: 'draw', player: 'corp' }]);
    expect(h.store.list('a:').map(([k]) => k)).toEqual(['a:000001']);
  });

  it('rejected: only the submitter hears (rejected + its view), seq unchanged, nothing stored', () => {
    const h = harness();
    const { host, guest } = started(h);
    host.take();
    guest.take();
    const writes = h.store.writes;
    // S-06-2 AC3: not your turn.
    h.room.message(guest, msg({ t: 'act', id: 3, action: { type: 'draw', player: 'runner' } }));
    expect(guest.take()).toEqual([
      { v: 1, t: 'rejected', ack: 3, view: viewFor('runner', truth(h)), events: [{ type: 'action_rejected', reason: 'not_your_turn' }] },
    ]);
    // Acting as the other seat: invalid_action.
    h.room.message(guest, msg({ t: 'act', id: 4, action: { type: 'draw', player: 'corp' } }));
    expect(guest.take()).toMatchObject([{ t: 'rejected', ack: 4, events: [{ type: 'action_rejected', reason: 'invalid_action' }] }]);
    expect(host.take()).toEqual([]);
    expect(h.store.writes).toBe(writes);
    expect(h.room.seq()).toBe(0);
  });

  it('acting in the lobby (nobody joined yet) is a bad_message', () => {
    const h = harness();
    const host = creator(h);
    h.room.message(host, msg({ t: 'create', side: 'corp' }));
    host.take();
    h.room.message(host, msg({ t: 'act', id: 1, action: { type: 'draw', player: 'corp' } }));
    expect(host.take()).toEqual([{ v: 1, t: 'error', code: 'bad_message' }]);
  });

  it('seq counts accepted actions only, across both seats', () => {
    const h = harness();
    const { host, guest } = started(h);
    const ups: ServerMsg[] = [];
    for (const [c, a] of [
      [host, { type: 'gain_credit', player: 'corp' }],
      [guest, { type: 'gain_credit', player: 'runner' }],
      [host, { type: 'gain_credit', player: 'corp' }],
      [host, { type: 'gain_credit', player: 'corp' }],
      [host, { type: 'end_turn', player: 'corp' }], // 6 cards: the discard step first
      [host, { type: 'discard', player: 'corp', handIndices: [0] }],
      [guest, { type: 'gain_credit', player: 'runner' }],
    ] as const) {
      h.room.message(c, msg({ t: 'act', id: 1, action: a }));
    }
    ups.push(...guest.msgs.filter((m) => m.t === 'update'));
    expect(ups.map((m) => (m.t === 'update' ? m.seq : -1))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(guest.msgs.filter((m) => m.t === 'rejected')).toHaveLength(1);
  });
});

describe('resume, replaced, presence, gap', () => {
  it('S-06-3: a phone that drops shows away to the other; resume gets a sync and the other sees here', () => {
    const h = harness();
    const { host, guest, guestToken } = started(h);
    host.take();
    h.room.disconnect(guest);
    expect(host.take()).toEqual([{ v: 1, t: 'presence', opponent: 'away' }]);
    // While away the game goes on.
    h.room.message(host, msg({ t: 'act', id: 1, action: { type: 'gain_credit', player: 'corp' } }));
    expect(host.take()).toMatchObject([{ t: 'update', seq: 1, ack: 1 }]);
    const back = player(h, 'guest2');
    h.room.message(back, msg({ t: 'resume', token: guestToken, since: 0 }));
    expect(back.take()).toEqual([{ v: 1, t: 'sync', seq: 1, view: viewFor('runner', truth(h)), opponent: 'here' }]);
    expect(back.role).toEqual({ kind: 'seat', seat: 'runner' });
    expect(host.take()).toEqual([{ v: 1, t: 'presence', opponent: 'here' }]);
    // Host's own sync would show the guest here.
    h.room.message(host, msg({ t: 'resume', token: tokenOf(host), since: 1 }));
    expect(host.take()).toEqual([{ v: 1, t: 'sync', seq: 1, view: viewFor('corp', truth(h)), opponent: 'here' }]);
  });

  it('a second socket for a seat replaces the first (error replaced, closed); the new one plays', () => {
    const h = harness();
    const { host, guest, hostToken } = started(h);
    host.take();
    guest.take();
    const again = player(h, 'host2');
    h.room.message(again, msg({ t: 'resume', token: hostToken, since: 0 }));
    expect(host.take()).toEqual([{ v: 1, t: 'error', code: 'replaced' }]);
    expect(host.closed?.reason).toBe('replaced');
    expect(again.take()).toMatchObject([{ t: 'sync', seq: 0 }]);
    // The old socket's late close and messages change nothing.
    h.room.disconnect(host);
    h.room.message(host, msg({ t: 'act', id: 1, action: { type: 'gain_credit', player: 'corp' } }));
    expect(h.room.seq()).toBe(0);
    expect(guest.take()).toEqual([{ v: 1, t: 'presence', opponent: 'here' }]);
    h.room.message(again, msg({ t: 'act', id: 2, action: { type: 'gain_credit', player: 'corp' } }));
    expect(again.take()).toMatchObject([{ t: 'update', seq: 1, ack: 2 }]);
  });

  it('a wrong token is bad_token (closed) and takes nothing', () => {
    const h = harness();
    const { host } = started(h);
    host.take();
    const p = player(h);
    h.room.message(p, msg({ t: 'resume', token: tokenOf(host) + 'x', since: 0 }));
    expect(p.take()).toEqual([{ v: 1, t: 'error', code: 'bad_token' }]);
    expect(p.closed?.reason).toBe('bad_token');
    expect(host.take()).toEqual([]);
  });

  it('resume in the lobby answers lobby; the host keeps the lobby across a reconnect', () => {
    const h = harness();
    const host = creator(h);
    h.room.message(host, msg({ t: 'create', side: 'runner' }));
    h.room.disconnect(host);
    const back = player(h);
    h.room.message(back, msg({ t: 'resume', token: tokenOf(host), since: 0 }));
    expect(back.take()).toEqual([{ v: 1, t: 'lobby', code: CODE, seat: 'runner' }]);
    const guest = player(h, 'guest');
    h.room.message(guest, msg({ t: 'join' }));
    expect(guest.take()[0]).toMatchObject({ t: 'seated', seat: 'corp' });
    expect(back.take()).toMatchObject([{ t: 'sync', seq: 0, opponent: 'here' }]);
  });

  it('gap: a client that missed updates sends resume{since} on the same socket and gets a sync', () => {
    const h = harness();
    const { host, guest, guestToken } = started(h);
    h.room.message(host, msg({ t: 'act', id: 1, action: { type: 'gain_credit', player: 'corp' } }));
    h.room.message(host, msg({ t: 'act', id: 2, action: { type: 'gain_credit', player: 'corp' } }));
    host.take();
    guest.take();
    h.room.message(guest, msg({ t: 'resume', token: guestToken, since: 1 }));
    expect(guest.take()).toEqual([{ v: 1, t: 'sync', seq: 2, view: viewFor('runner', truth(h)), opponent: 'here' }]);
    expect(host.take()).toEqual([]); // same socket: no presence change
  });

  it('ping is answered with pong; garbage is bad_message (kept open); another version is version (closed)', () => {
    const h = harness();
    const { host } = started(h);
    host.take();
    h.room.message(host, PING);
    h.room.message(host, '{nope');
    expect(host.take()).toEqual([
      { v: 1, t: 'pong' },
      { v: 1, t: 'error', code: 'bad_message' },
    ]);
    expect(host.closed).toBeNull();
    h.room.message(host, '{"v":2,"t":"join"}');
    expect(host.take()).toEqual([{ v: 1, t: 'error', code: 'version' }]);
    expect(host.closed?.reason).toBe('version');
  });
});

describe('Corp auto-pass (S-06-2 AC4/AC5)', () => {
  const plan = planUntil(corpOnlyPass);

  function atWindow(rngSeed = 1) {
    const h = harness({ testMode: true, rngSeed });
    const p = started(h, { seed: plan.seed, actions: plan.actions });
    p.host.take();
    p.guest.take();
    return { h, ...p };
  }

  it('when the Corp can only pass, the room passes for it after 1.2–2.4 s (a plain update, no ack)', () => {
    const { h, host, guest } = atWindow();
    expect(viewFor('runner', truth(h)).run?.waitingOn).toBe('corp');
    const t0 = h.clock.t;
    const at = h.room.nextWakeAt()!;
    expect(at - t0).toBeGreaterThanOrEqual(AUTO_PASS_MIN_MS);
    expect(at - t0).toBeLessThanOrEqual(AUTO_PASS_MAX_MS);
    // An early alarm does nothing.
    h.clock.t = at - 1;
    h.room.alarm();
    expect(host.take()).toEqual([]);
    expect(h.room.nextWakeAt()).toBe(at);
    h.clock.t = at;
    h.room.alarm();
    const seq = plan.actions.length + 1;
    expect(accepted(h).at(-1)).toEqual({ type: 'pass', player: 'corp' });
    const [hu] = host.take();
    const [gu] = guest.take();
    expect(hu).toMatchObject({ t: 'update', seq });
    expect(hu && 'ack' in hu).toBe(false);
    expect(gu).toMatchObject({ t: 'update', seq, events: [{ type: 'ice_passed' }] });
    expect(gu && 'ack' in gu).toBe(false);
  });

  it('the delay is random (not a fixed pause that would itself leak)', () => {
    const delays = new Set<number>();
    for (let r = 1; r <= 8; r++) {
      const { h } = atWindow(r * 7919);
      delays.add(h.room.nextWakeAt()! - h.clock.t);
    }
    expect(delays.size).toBeGreaterThan(4);
  });

  it('the Corp may tap Don\'t rez sooner; the scheduled pass is then dropped', () => {
    const { h, host } = atWindow();
    h.room.message(host, msg({ t: 'act', id: 9, action: { type: 'pass', player: 'corp' } }));
    expect(host.take()).toMatchObject([{ t: 'update', ack: 9 }]);
    const seq = h.room.seq();
    h.clock.t += AUTO_PASS_MAX_MS;
    h.room.alarm();
    expect(h.room.seq()).toBe(seq);
  });

  it('after an eviction mid-wait, the wake-up alarm passes at once', () => {
    const { h, host } = atWindow();
    const at = h.room.nextWakeAt()!;
    const woke = harness({ store: h.store, clock: h.clock, testMode: true });
    // The wrapper reattaches the still-open sockets before the alarm runs.
    woke.room.reattach(host, { kind: 'seat', seat: 'corp' });
    h.clock.t = at;
    woke.room.alarm();
    expect(accepted(woke).at(-1)).toEqual({ type: 'pass', player: 'corp' });
  });

  it('never passes for an away Corp (an away Corp who can pay stalls too, so the Runner learns nothing); a fresh pause once it is back', () => {
    const { h, host, hostToken } = atWindow();
    h.room.disconnect(host);
    expect(h.room.nextWakeAt()).toBe(meta(h).lastActive + IDLE_TTL_MS);
    const seq = h.room.seq();
    h.clock.t += AUTO_PASS_MAX_MS * 10;
    h.room.alarm();
    expect(h.room.seq()).toBe(seq);
    // Evicted while the Corp is away: the wake-up does not pass either.
    const woke = harness({ store: h.store, clock: h.clock, testMode: true });
    woke.room.alarm();
    expect(woke.room.seq()).toBe(seq);
    // The Corp comes back: a new random pause, then the pass.
    const back = player(woke, 'host2');
    woke.room.message(back, msg({ t: 'resume', token: hostToken, since: seq }));
    const at = woke.room.nextWakeAt()!;
    expect(at - h.clock.t).toBeGreaterThanOrEqual(AUTO_PASS_MIN_MS);
    expect(at - h.clock.t).toBeLessThanOrEqual(AUTO_PASS_MAX_MS);
    h.clock.t = at;
    woke.room.alarm();
    expect(woke.room.seq()).toBe(seq + 1);
  });

  it('no auto-pass while a Corp who can pay decides, or before the guest joins', () => {
    const affordable = planUntil((s) => s.run?.step === 'approach' && !corpOnlyPass(s));
    const h = harness({ testMode: true });
    const host = creator(h);
    h.room.message(host, msg({ t: 'create', side: 'corp', test: { seed: affordable.seed, actions: affordable.actions } }));
    expect(h.room.nextWakeAt()).toBe(meta(h).createdAt + LOBBY_TTL_MS);
    h.room.message(player(h), msg({ t: 'join' }));
    expect(h.room.nextWakeAt()).toBe(meta(h).lastActive + IDLE_TTL_MS);
    // At a pass-only window but nobody has joined yet: the lobby just waits.
    const b = harness({ testMode: true });
    b.room.message(creator(b), msg({ t: 'create', side: 'corp', test: { seed: plan.seed, actions: plan.actions } }));
    expect(b.room.nextWakeAt()).toBe(meta(b).createdAt + LOBBY_TTL_MS);
    b.room.message(player(b), msg({ t: 'join' }));
    expect(b.room.nextWakeAt()! - b.clock.t).toBeLessThanOrEqual(AUTO_PASS_MAX_MS);
  });
});

describe('cleanup (TTL wake-ups)', () => {
  it('a lobby nobody joins expires after 2 h: sockets get expired, storage is wiped, the code is free', () => {
    const h = harness();
    const host = creator(h);
    h.room.message(host, msg({ t: 'create', side: 'corp' }));
    host.take();
    const at = h.room.nextWakeAt()!;
    expect(at).toBe(h.clock.t + LOBBY_TTL_MS);
    h.clock.t = at;
    h.room.alarm();
    expect(host.take()).toEqual([{ v: 1, t: 'error', code: 'expired' }]);
    expect(host.closed?.reason).toBe('expired');
    expect(h.store.data.size).toBe(0);
    expect(h.room.canCreate()).toBe(true);
    expect(h.room.nextWakeAt()).toBeNull();
    const late = player(h);
    h.room.message(late, msg({ t: 'join' }));
    expect(late.take()).toEqual([{ v: 1, t: 'error', code: 'no_game' }]);
  });

  it('an idle game lasts 3 days from its last move; each move pushes it back', () => {
    const h = harness();
    const { host, guest } = started(h);
    h.clock.t += 1000;
    h.room.message(host, msg({ t: 'act', id: 1, action: { type: 'gain_credit', player: 'corp' } }));
    expect(h.room.nextWakeAt()).toBe(h.clock.t + IDLE_TTL_MS);
    h.clock.t += IDLE_TTL_MS - 1;
    h.room.alarm();
    expect(guest.closed).toBeNull();
    h.clock.t += 1;
    h.room.alarm();
    expect(guest.last()).toEqual({ v: 1, t: 'error', code: 'expired' });
    expect(h.store.data.size).toBe(0);
  });

  it('a finished game is cleaned up 1 h after the last move', () => {
    const win = planToStep(1, 'corp_one_score_from_win');
    const h = harness({ testMode: true });
    const { host } = started(h, { seed: win.seed, actions: win.actions });
    const uid = (win.info as { uid: string }).uid;
    h.room.message(host, msg({ t: 'act', id: 1, action: { type: 'score', player: 'corp', uid } }));
    expect(truth(h).phase).toBe('over');
    expect(h.room.nextWakeAt()).toBe(h.clock.t + FINISHED_TTL_MS);
  });
});

describe('restore after a wake', () => {
  function midGame() {
    const plan = planUntil((s) => s.turn >= 4 && s.phase === 'action', 3);
    const h = harness({ testMode: true });
    const p = started(h, { seed: plan.seed, actions: plan.actions });
    return { h, ...p };
  }

  it('same build: from the snapshot (no replay); sockets reattach and play on', () => {
    const { h, host, guest } = midGame();
    const before = { corp: viewFor('corp', truth(h)), runner: viewFor('runner', truth(h)), seq: h.room.seq() };
    // Prove the snapshot is what's used: mark it.
    const snap = h.store.get<GameState>('state')!;
    h.store.put('state', { ...snap, players: { ...snap.players, corp: { ...snap.players.corp, credits: 77 } } });
    const woke = new Room(h.store, h.deps);
    woke.reattach(host, { kind: 'seat', seat: 'corp' });
    woke.reattach(guest, { kind: 'seat', seat: 'runner' });
    expect(woke.seq()).toBe(before.seq);
    host.take();
    guest.take();
    woke.message(guest, msg({ t: 'resume', token: tokenOf(guest), since: before.seq }));
    const [sync] = guest.take();
    expect(sync?.t === 'sync' && sync.view.players.corp.credits).toBe(77);
    expect(woke.canCreate()).toBe(false);
  });

  it('another build: by replay of the action log (the snapshot is ignored and rewritten)', () => {
    const { h, host, guest } = midGame();
    const expected = { corp: viewFor('corp', truth(h)), runner: viewFor('runner', truth(h)) };
    const snap = h.store.get<GameState>('state')!;
    h.store.put('state', { ...snap, players: { ...snap.players, corp: { ...snap.players.corp, credits: 77 } } });
    const woke = new Room(h.store, { ...h.deps, build: 'b2' });
    expect(meta(h).build).toBe('b2');
    expect(h.store.get<GameState>('state')).toEqual(truth(h));
    woke.reattach(host, { kind: 'seat', seat: 'corp' });
    woke.reattach(guest, { kind: 'seat', seat: 'runner' });
    host.take();
    guest.take();
    woke.message(host, msg({ t: 'resume', token: tokenOf(host), since: 0 }));
    woke.message(guest, msg({ t: 'resume', token: tokenOf(guest), since: 0 }));
    expect(host.take()[0]).toMatchObject({ t: 'sync', view: expected.corp });
    expect(guest.take()[0]).toMatchObject({ t: 'sync', view: expected.runner });
    // And plays on.
    const who = expected.corp.legalActions.length > 0 ? host : guest;
    const view = who === host ? expected.corp : expected.runner;
    woke.message(who, msg({ t: 'act', id: 5, action: view.legalActions[0] }));
    expect(who.take()[0]).toMatchObject({ t: 'update', ack: 5, seq: woke.seq() });
  });

  it('reattach refuses a seat socket that has no seat in storage (stale attachment)', () => {
    const h = harness();
    const c = new FakeConn();
    h.room.reattach(c, { kind: 'seat', seat: 'corp' });
    expect(c.closed?.code).toBe(CLOSE_ERROR);
  });
});
