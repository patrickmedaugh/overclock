// U3: OnlineMatch against a fake WebSocket and a fake clock (no server).
import type { Action, PlayerView } from '@overclock/engine';
import { LocalMatch } from '@overclock/match';
import { PING, PONG, STORAGE_KEY, type ServerMsg, encodeMsg } from '@overclock/protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import { ONLINE_TIMING, type OnlineDeps, OnlineMatch, type OnlinePhase, type SocketLike, readStoredSeat } from '../src/online';
import type { Presentation } from '../src/session';

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: string[] = [];
  closed: { code?: number; reason?: string } | null = null;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor(readonly url: string) {}
  send(data: string): void {
    if (this.readyState !== 1) throw new Error('not open');
    this.sent.push(data);
  }
  close(code?: number, reason?: string): void {
    this.closed = { code, reason };
    this.readyState = 3;
  }
  // ---- test side
  serverOpen(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  serverSend(msg: ServerMsg | string): void {
    this.onmessage?.({ data: typeof msg === 'string' ? msg : encodeMsg(msg) });
  }
  serverClose(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code, reason: '' });
  }
  /** Parsed client messages (ping as the string). */
  msgs(): unknown[] {
    return this.sent.map((s) => (s === PING ? 'ping' : JSON.parse(s)));
  }
}

class FakeClock {
  now = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();
  private next = 1;
  setTimeout = (fn: () => void, ms: number): unknown => {
    const id = this.next++;
    this.timers.set(id, { at: this.now + ms, fn });
    return id;
  };
  clearTimeout = (id: unknown): void => {
    this.timers.delete(id as number);
  };
  advance(ms: number): void {
    const end = this.now + ms;
    for (;;) {
      let first: [number, { at: number; fn: () => void }] | null = null;
      for (const e of this.timers) if (e[1].at <= end && (!first || e[1].at < first[1].at)) first = e;
      if (!first) break;
      this.timers.delete(first[0]);
      this.now = first[1].at;
      first[1].fn();
    }
    this.now = end;
  }
  pending(): number {
    return this.timers.size;
  }
}

class MemStore {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

const SERVER = 'wss://game.test';
let sockets: FakeSocket[];
let clock: FakeClock;
let store: MemStore;
let visible: boolean;

function deps(): OnlineDeps {
  return {
    server: SERVER,
    connect: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    storage: store,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    random: () => 0.5,
    visible: () => visible,
  };
}

const last = () => sockets.at(-1)!;
const match = new LocalMatch(3);
const corpView: PlayerView = match.view('corp');
const runnerView: PlayerView = match.view('runner');

beforeEach(() => {
  sockets = [];
  clock = new FakeClock();
  store = new MemStore();
  visible = true;
});

/** A runner who joined K7QF and got the start sync. */
function joined(): { m: OnlineMatch; presented: Presentation[]; phases: OnlinePhase[] } {
  const m = OnlineMatch.join(deps(), 'K7QF');
  const presented: Presentation[] = [];
  const phases: OnlinePhase[] = [];
  m.onPresent((p) => presented.push(p));
  m.onPhase((p) => phases.push(p));
  last().serverOpen();
  last().serverSend({ v: 1, t: 'seated', code: 'K7QF', seat: 'runner', token: 'tok' });
  last().serverSend({ v: 1, t: 'sync', seq: 0, view: runnerView, opponent: 'here' });
  return { m, presented, phases };
}

describe('OnlineMatch: start a game', () => {
  it('create: opens /v1/create, sends create with the side, stores the seat, shows the lobby, then plays on sync', () => {
    const m = OnlineMatch.create(deps(), 'corp');
    const phases: OnlinePhase[] = [];
    m.onPhase((p) => phases.push(p));
    expect(last().url).toBe(`${SERVER}/v1/create`);
    last().serverOpen();
    expect(last().msgs()).toEqual([{ v: 1, t: 'create', side: 'corp' }]);
    last().serverSend({ v: 1, t: 'seated', code: 'K7QF', seat: 'corp', token: 'tok' });
    last().serverSend({ v: 1, t: 'lobby', code: 'K7QF', seat: 'corp' });
    expect(phases).toEqual([{ kind: 'lobby', code: 'K7QF', seat: 'corp' }]);
    expect(m.gameCode).toBe('K7QF');
    expect(JSON.parse(store.getItem(STORAGE_KEY)!)).toEqual({ server: SERVER, code: 'K7QF', seat: 'corp', token: 'tok' });
    last().serverSend({ v: 1, t: 'sync', seq: 0, view: corpView, opponent: 'here' });
    expect(phases.at(-1)).toEqual({ kind: 'playing' });
    expect(m.seat).toBe('corp');
    expect(m.view()).toEqual(corpView);
    expect(m.status()).toEqual({ connection: 'open', opponent: 'here' });
  });

  it('create passes a test setup through', () => {
    OnlineMatch.create(deps(), 'runner', { seed: 5, actions: [] });
    last().serverOpen();
    expect(last().msgs()).toEqual([{ v: 1, t: 'create', side: 'runner', test: { seed: 5, actions: [] } }]);
  });

  it('join: opens the game path and sends join; seated then sync starts the game', () => {
    const { m, phases } = joined();
    expect(sockets[0]!.url).toBe(`${SERVER}/v1/games/K7QF`);
    expect(sockets[0]!.msgs()).toEqual([{ v: 1, t: 'join' }]);
    expect(phases).toEqual([{ kind: 'playing' }]);
    expect(m.seat).toBe('runner');
  });

  it('a wrong code fails with no_game and leaves nothing stored', () => {
    const m = OnlineMatch.join(deps(), 'ZZZZ');
    const phases: OnlinePhase[] = [];
    m.onPhase((p) => phases.push(p));
    last().serverOpen();
    last().serverSend({ v: 1, t: 'error', code: 'no_game' });
    expect(phases).toEqual([{ kind: 'failed', reason: 'no_game' }]);
    expect(store.getItem(STORAGE_KEY)).toBeNull();
    expect(last().closed).not.toBeNull();
    // No reconnect after a refusal.
    clock.advance(60_000);
    expect(sockets).toHaveLength(1);
  });

  it('a full game fails with full', () => {
    const m = OnlineMatch.join(deps(), 'K7QF');
    last().serverOpen();
    last().serverSend({ v: 1, t: 'error', code: 'full' });
    expect(m.phase).toEqual({ kind: 'failed', reason: 'full' });
  });

  it('no network before a seat: fails with network (nothing to come back to)', () => {
    const m = OnlineMatch.create(deps(), 'corp');
    last().serverClose();
    expect(m.phase).toEqual({ kind: 'failed', reason: 'network' });
    clock.advance(60_000);
    expect(sockets).toHaveLength(1);
  });

  it('a message from another protocol version fails with version', () => {
    const m = OnlineMatch.join(deps(), 'K7QF');
    last().serverOpen();
    last().serverSend('{"v":2,"t":"sync"}');
    expect(m.phase).toEqual({ kind: 'failed', reason: 'version' });
  });

  it('readStoredSeat ignores a seat from another server or a broken entry', () => {
    store.setItem(STORAGE_KEY, JSON.stringify({ server: 'wss://other', code: 'K7QF', seat: 'corp', token: 't' }));
    expect(readStoredSeat(store, SERVER)).toBeNull();
    store.setItem(STORAGE_KEY, '{nope');
    expect(readStoredSeat(store, SERVER)).toBeNull();
    store.setItem(STORAGE_KEY, JSON.stringify({ server: SERVER, code: 'K7QF', seat: 'corp', token: 't' }));
    expect(readStoredSeat(store, SERVER)).toEqual({ server: SERVER, code: 'K7QF', seat: 'corp', token: 't' });
  });
});

describe('OnlineMatch: playing', () => {
  const draw: Action = { type: 'draw', player: 'runner' };

  it('submit sends act; one at a time until the ack; the update presents with its events', () => {
    const { m, presented } = joined();
    m.submit(draw);
    m.submit(draw);
    expect(last().msgs().filter((x) => (x as { t?: string }).t === 'act')).toEqual([{ v: 1, t: 'act', id: 1, action: draw }]);
    expect(m.busy).toBe(true);
    const events = [{ type: 'card_drawn', player: 'runner' }] as never;
    last().serverSend({ v: 1, t: 'update', seq: 1, view: runnerView, events, ack: 1 });
    expect(m.busy).toBe(false);
    expect(m.lastEvents()).toEqual(events);
    expect(presented.at(-1)).toEqual({ kind: 'same', view: runnerView, events, decision: null });
    m.submit(draw);
    expect(last().msgs().filter((x) => (x as { t?: string }).t === 'act')).toHaveLength(2);
  });

  it("the other player's move arrives as an update without ack and animates", () => {
    const { m, presented } = joined();
    last().serverSend({ v: 1, t: 'update', seq: 1, view: runnerView, events: [{ type: 'credit_gained', player: 'corp', amount: 1 }] as never });
    expect(presented).toHaveLength(1);
    expect(m.lastEvents()).toEqual([]);
  });

  it('rejected unlocks and presents the hint events', () => {
    const { m, presented } = joined();
    m.submit(draw);
    const ev = [{ type: 'action_rejected', reason: 'not_your_turn' }] as never;
    last().serverSend({ v: 1, t: 'rejected', ack: 1, view: runnerView, events: ev });
    expect(m.busy).toBe(false);
    expect(presented.at(-1)).toEqual({ kind: 'same', view: runnerView, events: ev, decision: null });
  });

  it('a gap in seq asks for a resync (resume since the last seq) and drops updates until the sync', () => {
    const { presented } = joined();
    last().serverSend({ v: 1, t: 'update', seq: 2, view: runnerView, events: [] });
    expect(last().msgs().at(-1)).toEqual({ v: 1, t: 'resume', token: 'tok', since: 0 });
    last().serverSend({ v: 1, t: 'update', seq: 3, view: runnerView, events: [] });
    expect(presented).toHaveLength(0);
    last().serverSend({ v: 1, t: 'sync', seq: 3, view: runnerView, opponent: 'here' });
    expect(presented).toEqual([{ kind: 'same', view: runnerView, events: [], decision: null }]);
  });

  it('presence changes reach status listeners', () => {
    const { m } = joined();
    const seen: string[] = [];
    m.onStatus((s) => seen.push(s.opponent));
    last().serverSend({ v: 1, t: 'presence', opponent: 'away' });
    expect(m.status().opponent).toBe('away');
    expect(seen).toEqual(['away']);
  });

  it('no ack within 5 s: reconnects and resumes', () => {
    const { m } = joined();
    m.submit(draw);
    clock.advance(ONLINE_TIMING.ackWait);
    expect(sockets).toHaveLength(2);
    expect(m.busy).toBe(false);
    last().serverOpen();
    expect(last().msgs()).toEqual([{ v: 1, t: 'resume', token: 'tok', since: 0 }]);
  });

  it('a finished game is forgotten (no Rejoin)', () => {
    joined();
    expect(store.getItem(STORAGE_KEY)).not.toBeNull();
    last().serverSend({ v: 1, t: 'update', seq: 1, view: { ...runnerView, result: { winner: 'runner', reason: 'agenda_points' } } as PlayerView, events: [] });
    expect(store.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('OnlineMatch: coming back', () => {
  it('a dropped socket reconnects with backoff 0.5, 1, 2, 4, 8, 10 s and resumes since the last seq', () => {
    const { m } = joined();
    last().serverSend({ v: 1, t: 'update', seq: 1, view: runnerView, events: [] });
    const delays: number[] = [];
    for (let i = 0; i < 7; i++) {
      const n = sockets.length;
      const t0 = clock.now;
      last().serverClose();
      expect(m.status().connection).toBe('reconnecting');
      while (sockets.length === n) clock.advance(50);
      delays.push(clock.now - t0);
    }
    // random() = 0.5 -> no jitter.
    expect(delays).toEqual([500, 1000, 2000, 4000, 8000, 8000, 8000].map((d) => Math.ceil(Math.min(d, 10_000) / 50) * 50));
    last().serverOpen();
    expect(last().msgs()).toEqual([{ v: 1, t: 'resume', token: 'tok', since: 1 }]);
    last().serverSend({ v: 1, t: 'sync', seq: 1, view: runnerView, opponent: 'here' });
    expect(m.status().connection).toBe('open');
  });

  it('wake() reconnects a dropped socket at once', () => {
    const { m } = joined();
    last().serverClose();
    const n = sockets.length;
    m.wake();
    expect(sockets.length).toBe(n + 1);
  });

  it('wake() on an open socket pings; no pong in 3 s reconnects', () => {
    const { m } = joined();
    m.wake();
    expect(last().sent.at(-1)).toBe(PING);
    clock.advance(ONLINE_TIMING.wakePongWait);
    expect(sockets).toHaveLength(2);
  });

  it('pings every 20 s while visible; a pong keeps the socket', () => {
    joined();
    clock.advance(ONLINE_TIMING.ping);
    expect(last().sent.at(-1)).toBe(PING);
    last().serverSend(PONG);
    clock.advance(ONLINE_TIMING.pongWait + 1);
    expect(sockets).toHaveLength(1);
    // Hidden: no ping.
    visible = false;
    const before = last().sent.length;
    clock.advance(ONLINE_TIMING.ping * 3);
    expect(last().sent.length).toBe(before);
  });

  it('resume from storage opens the game path and sends resume', () => {
    const m = OnlineMatch.resume(deps(), { server: SERVER, code: 'K7QF', seat: 'corp', token: 'tok' });
    expect(last().url).toBe(`${SERVER}/v1/games/K7QF`);
    last().serverOpen();
    expect(last().msgs()).toEqual([{ v: 1, t: 'resume', token: 'tok', since: 0 }]);
    last().serverSend({ v: 1, t: 'sync', seq: 4, view: corpView, opponent: 'away' });
    expect(m.phase).toEqual({ kind: 'playing' });
    expect(m.status()).toEqual({ connection: 'open', opponent: 'away' });
  });

  it('expired / bad token forget the stored seat', () => {
    store.setItem(STORAGE_KEY, JSON.stringify({ server: SERVER, code: 'K7QF', seat: 'corp', token: 'tok' }));
    const m = OnlineMatch.resume(deps(), { server: SERVER, code: 'K7QF', seat: 'corp', token: 'tok' });
    last().serverOpen();
    last().serverSend({ v: 1, t: 'error', code: 'expired' });
    expect(m.phase).toEqual({ kind: 'failed', reason: 'expired' });
    expect(store.getItem(STORAGE_KEY)).toBeNull();
  });

  it('leave() stops for good but keeps the seat for Rejoin', () => {
    const { m } = joined();
    m.leave();
    expect(sockets[0]!.closed).not.toBeNull();
    clock.advance(60_000);
    expect(sockets).toHaveLength(1);
    expect(store.getItem(STORAGE_KEY)).not.toBeNull();
    expect(clock.pending()).toBe(0);
  });
});
