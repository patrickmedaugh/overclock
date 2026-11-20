// Sprint 11 E2 (S-11-3 online): Leave for now and the 7-day idle limit.
// - leave in a started game: the leaver's socket closes normally ('left'), the other seat hears
//   presence {away, left: true}, the game and its log are kept;
// - resume with the token clears it (the other seat hears here, no flag);
// - a sync while the opponent is left carries left: true;
// - the room expires 7 days after the last move or leave (not 3 days);
// - meta.left survives a wake (same build: snapshot; another build: replay).
import { replay, type Action, type GameState } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { CLOSE_NORMAL, IDLE_TTL_MS, Room, type RoomMeta } from '../src/room';
import { FakeConn, harness, msg, type Harness } from './fakes';
import { corpOnlyPass, planUntil } from './plans';

const CODE = 'K7QF';
const DAY = 24 * 60 * 60 * 1000;

function creator(h: Harness): FakeConn {
  const c = new FakeConn('host');
  h.room.connect(c, { kind: 'creator', code: CODE });
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
const accepted = (h: Harness) => h.store.list<Action>('a:').map(([, a]) => a);

/** Corp host + Runner guest, both seated, game started, inboxes emptied. */
function started(h: Harness, test?: { seed: number; actions: Action[] }) {
  const host = creator(h);
  h.room.message(host, msg({ t: 'create', side: 'corp', ...(test ? { test } : {}) }));
  const guest = player(h.room);
  h.room.message(guest, msg({ t: 'join' }));
  h.room.message(guest, msg({ t: 'pick' }));
  const out = { host, guest, hostToken: tokenOf(host), guestToken: tokenOf(guest) };
  host.take();
  guest.take();
  return out;
}

/** A Corp move then a Runner-side leave: returns the harness mid-game. */
function runnerLeft() {
  const h = harness();
  const p = started(h);
  h.clock.t += 1000;
  h.room.message(p.host, msg({ t: 'act', id: 1, action: { type: 'gain_credit', player: 'corp' } }));
  p.host.take();
  p.guest.take();
  h.clock.t += 5000;
  h.room.message(p.guest, msg({ t: 'leave' }));
  return { h, ...p };
}

describe('Sprint 11: Leave for now', () => {
  it('the leaver is closed normally; the other seat hears away + left; the game is kept', () => {
    const { h, host, guest } = runnerLeft();
    expect(guest.closed).toEqual({ code: CLOSE_NORMAL, reason: 'left' });
    expect(guest.take()).toEqual([]);
    expect(host.take()).toEqual([{ v: 2, t: 'presence', opponent: 'away', left: true }]);
    expect(host.closed).toBeNull();
    expect(meta(h).left).toEqual({ runner: true });
    expect(meta(h).lastActive).toBe(h.clock.t);
    expect(accepted(h)).toEqual([{ type: 'gain_credit', player: 'corp' }]);
    expect(h.room.seq()).toBe(1);
    // The close event the socket sends afterwards changes nothing.
    h.room.disconnect(guest);
    expect(host.take()).toEqual([]);
    // A message on the closed socket is ignored (its role is gone).
    h.room.message(guest, msg({ t: 'act', id: 2, action: { type: 'draw', player: 'runner' } }));
    expect(h.room.seq()).toBe(1);
  });

  it('the remaining seat can still play its turn', () => {
    const { h, host } = runnerLeft();
    host.take();
    h.room.message(host, msg({ t: 'act', id: 2, action: { type: 'gain_credit', player: 'corp' } }));
    expect(host.take()).toEqual([expect.objectContaining({ t: 'update', seq: 2, ack: 2 })]);
  });

  it('resume with the token clears it: the leaver gets a sync, the other seat hears here (no flag)', () => {
    const { h, host, guestToken } = runnerLeft();
    host.take();
    const back = player(h.room, 'back');
    h.room.message(back, msg({ t: 'resume', token: guestToken, since: 0 }));
    const [sync] = back.take();
    expect(sync).toMatchObject({ t: 'sync', seq: 1, opponent: 'here' });
    expect(sync).not.toHaveProperty('left');
    expect(sync?.t === 'sync' && sync.view.viewer).toBe('runner');
    expect(host.take()).toEqual([{ v: 2, t: 'presence', opponent: 'here' }]);
    expect(meta(h).left).toEqual({});
  });

  it('a sync to the other seat while the opponent is left carries left: true; a plain drop does not', () => {
    const { h, host, hostToken } = runnerLeft();
    const again = player(h.room, 'host2');
    h.room.message(again, msg({ t: 'resume', token: hostToken, since: 0 }));
    expect(again.take()[0]).toMatchObject({ t: 'sync', opponent: 'away', left: true });
    expect(host.closed).not.toBeNull(); // replaced

    // A Corp whose phone just drops (no leave): away, no flag.
    const h2 = harness();
    const p = started(h2);
    h2.room.disconnect(p.host);
    expect(p.guest.take()).toEqual([{ v: 2, t: 'presence', opponent: 'away' }]);
    const g2 = player(h2.room, 'guest2');
    h2.room.message(g2, msg({ t: 'resume', token: p.guestToken, since: 0 }));
    const [sync] = g2.take();
    expect(sync).toMatchObject({ t: 'sync', opponent: 'away' });
    expect(sync).not.toHaveProperty('left');
  });

  it('both seats can leave for now; either comes back and plays on', () => {
    const { h, host, hostToken } = runnerLeft();
    h.room.message(host, msg({ t: 'leave' }));
    expect(host.closed).toEqual({ code: CLOSE_NORMAL, reason: 'left' });
    expect(meta(h).left).toEqual({ runner: true, corp: true });
    const back = player(h.room, 'corp-back');
    h.room.message(back, msg({ t: 'resume', token: hostToken, since: 1 }));
    expect(back.take()[0]).toMatchObject({ t: 'sync', seq: 1, opponent: 'away', left: true });
    h.room.message(back, msg({ t: 'act', id: 1, action: { type: 'gain_credit', player: 'corp' } }));
    expect(back.take()[0]).toMatchObject({ t: 'update', seq: 2, ack: 1 });
    expect(meta(h).left).toEqual({ runner: true });
  });

  it('a left Corp is never auto-passed for (the run waits for it, as for an away Corp)', () => {
    const plan = planUntil(corpOnlyPass);
    const h = harness({ testMode: true });
    const { host } = started(h, { seed: plan.seed, actions: plan.actions });
    expect(h.room.nextWakeAt()).toBeLessThan(meta(h).lastActive + IDLE_TTL_MS); // an auto-pass is pending
    h.room.message(host, msg({ t: 'leave' }));
    expect(h.room.nextWakeAt()).toBe(meta(h).lastActive + IDLE_TTL_MS);
    h.clock.t += 10_000;
    h.room.alarm();
    expect(h.room.seq()).toBe(plan.actions.length);
  });

  it('leave in a lobby still closes the room (Sprint 7), and a socket with no seat still gets bad_message', () => {
    const h = harness();
    const host = creator(h);
    h.room.message(host, msg({ t: 'create', side: 'runner' }));
    const stranger = player(h.room, 'stranger');
    h.room.message(stranger, msg({ t: 'leave' }));
    expect(stranger.last()).toEqual({ v: 2, t: 'error', code: 'bad_message' });
    h.room.message(host, msg({ t: 'leave' }));
    expect(host.closed).toEqual({ code: CLOSE_NORMAL, reason: 'left' });
    expect(h.store.data.size).toBe(0);
  });
});

describe('Sprint 11: the 7-day limit (owner Q2 A)', () => {
  it('IDLE_TTL_MS is 7 days', () => {
    expect(IDLE_TTL_MS).toBe(7 * DAY);
  });

  it('a left game is still there after 3 days and 6 days 23 h; gone at 7 days from the leave', () => {
    const { h, host, guestToken } = runnerLeft();
    const leftAt = h.clock.t;
    expect(h.room.nextWakeAt()).toBe(leftAt + 7 * DAY);
    h.clock.t = leftAt + 3 * DAY + 1;
    h.room.alarm();
    expect(h.store.get('meta')).toBeDefined();
    h.clock.t = leftAt + 7 * DAY - 1;
    h.room.alarm();
    expect(host.closed).toBeNull();
    h.clock.t = leftAt + 7 * DAY;
    h.room.alarm();
    expect(host.last()).toEqual({ v: 2, t: 'error', code: 'expired' });
    expect(h.store.data.size).toBe(0);
    const late = player(h.room, 'late');
    h.room.message(late, msg({ t: 'resume', token: guestToken, since: 1 }));
    expect(late.take()).toEqual([{ v: 2, t: 'error', code: 'no_game' }]);
  });

  it('the leave itself restarts the clock (7 days from the leave, not from the last move)', () => {
    const h = harness();
    const p = started(h);
    h.room.message(p.host, msg({ t: 'act', id: 1, action: { type: 'gain_credit', player: 'corp' } }));
    const movedAt = h.clock.t;
    h.clock.t += 2 * DAY;
    h.room.message(p.guest, msg({ t: 'leave' }));
    expect(h.room.nextWakeAt()).toBe(movedAt + 9 * DAY);
  });

  it('both back within the week: play goes on where it stopped', () => {
    const { h, hostToken, guestToken } = runnerLeft();
    h.clock.t += 6 * DAY;
    h.room.alarm();
    const c = player(h.room, 'c');
    const r = player(h.room, 'r');
    h.room.message(c, msg({ t: 'resume', token: hostToken, since: 0 }));
    h.room.message(r, msg({ t: 'resume', token: guestToken, since: 0 }));
    const truth: GameState = replay(meta(h).seed, accepted(h), meta(h).options).state;
    expect(r.take()[0]).toMatchObject({ t: 'sync', seq: 1, opponent: 'here' });
    expect(truth.players.corp.clicks).toBe(2);
    h.room.message(c, msg({ t: 'act', id: 1, action: { type: 'gain_credit', player: 'corp' } }));
    expect(r.take().at(-1)).toMatchObject({ t: 'update', seq: 2 });
  });
});

describe('Sprint 11: meta.left survives a wake', () => {
  for (const build of ['b1', 'b2'] as const) {
    it(`${build === 'b1' ? 'same build (snapshot)' : 'another build (replay)'}: still left; the other seat's sync says so`, () => {
      const { h, host, hostToken, guestToken } = runnerLeft();
      const woke = new Room(h.store, { ...h.deps, build });
      woke.reattach(host, { kind: 'seat', seat: 'corp' });
      host.take();
      expect(h.store.get<RoomMeta>('meta')!.left).toEqual({ runner: true });
      woke.message(host, msg({ t: 'resume', token: hostToken, since: 1 }));
      expect(host.take()[0]).toMatchObject({ t: 'sync', seq: 1, opponent: 'away', left: true });
      const back = player(woke, 'back');
      woke.message(back, msg({ t: 'resume', token: guestToken, since: 1 }));
      expect(back.take()[0]).toMatchObject({ t: 'sync', seq: 1, opponent: 'here' });
      expect(host.take()).toEqual([{ v: 2, t: 'presence', opponent: 'here' }]);
      expect(h.store.get<RoomMeta>('meta')!.left).toEqual({});
    });
  }
});
