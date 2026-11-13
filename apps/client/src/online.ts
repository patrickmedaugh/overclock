// Sprint 6 (U3): an online game over the protocol (`@overclock/protocol`). One
// seat plays on this phone; the server runs the rules and sends this seat only
// its own projected view and events. No rules here: the client forwards actions
// and shows what comes back.
//
// Lifecycle (`phase`): connecting -> lobby (the starter waits for the joiner)
// -> playing; or failed (no game, full, the network, ...). While playing, the
// socket may drop: the match reconnects with backoff and catches up with a
// full `sync` (no replayed animations).
import type { Action, GameEvent, PlayerView, Side } from '@overclock/engine';
import {
  CREATE_PATH,
  type ClientMsg,
  type ErrorCode,
  PING,
  type Presence,
  STORAGE_KEY,
  type ServerMsg,
  type StoredSeat,
  type TestSetup,
  encodeMsg,
  gamePath,
  parseServerMsg,
} from '@overclock/protocol';
import { type Connection, Listeners, type Presentation, type Session, type SessionStatus } from './session';

/** The part of a browser WebSocket the match uses (a fake one in unit tests). */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number; reason: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

/** The part of localStorage the match uses. */
export interface StoreLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface OnlineDeps {
  /** The service's base address, e.g. `wss://overclock.example.workers.dev`. */
  server: string;
  connect(url: string): SocketLike;
  storage: StoreLike | null;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  /** Uniform in [0, 1) (reconnect jitter). */
  random(): number;
  /** Is the page on screen? Pings only run while it is. */
  visible(): boolean;
}

export type FailReason = ErrorCode | 'network';

export type OnlinePhase =
  | { kind: 'connecting' }
  /** Waiting for the other player to join with `code`. */
  | { kind: 'lobby'; code: string; seat: Side }
  | { kind: 'playing' }
  | { kind: 'failed'; reason: FailReason };

/** Timing (ms). Tech plan: backoff 0.5, 1, 2, 4, 8 s (cap 10 s, jitter); ping every 20 s; no pong in 10 s -> reconnect; no ack in 5 s -> reconnect. */
export const ONLINE_TIMING = {
  backoff: [500, 1000, 2000, 4000, 8000],
  backoffCap: 10_000,
  ping: 20_000,
  pongWait: 10_000,
  /** After coming back (page shown again, network back): a quicker check of the old socket. */
  wakePongWait: 3_000,
  ackWait: 5_000,
} as const;

const OPEN = 1;

/** Reads the stored seat for `server` (null if none, broken, or from another server). */
export function readStoredSeat(storage: StoreLike | null, server: string): StoredSeat | null {
  if (!storage || !server) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<StoredSeat>;
    if (s.server !== server || typeof s.code !== 'string' || typeof s.token !== 'string' || (s.seat !== 'corp' && s.seat !== 'runner')) return null;
    return { server: s.server, code: s.code, seat: s.seat, token: s.token };
  } catch {
    return null;
  }
}

export function forgetStoredSeat(storage: StoreLike | null): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable: nothing to forget
  }
}

type Start = { kind: 'create'; side: Side; test?: TestSetup } | { kind: 'join'; code: string } | { kind: 'resume'; seat: StoredSeat };

export class OnlineMatch implements Session {
  readonly kind = 'online' as const;
  private socket: SocketLike | null = null;
  private code: string | null = null;
  private mySeat: Side;
  private token: string | null = null;
  private seq = -1;
  private current: PlayerView | null = null;
  private last: GameEvent[] = [];
  private opponent: Presence = 'none';
  private connection: Connection = 'connecting';
  private phaseNow: OnlinePhase = { kind: 'connecting' };
  private nextId = 1;
  private pending: { id: number; timer: unknown } | null = null;
  /** Waiting for a `sync` after a gap in `seq` (updates are dropped until it comes). */
  private resyncing = false;
  private attempt = 0;
  private retryTimer: unknown = null;
  private pingTimer: unknown = null;
  private pongTimer: unknown = null;
  /** We closed on purpose (left, failed): no reconnect. */
  private stopped = false;
  private readonly presented = new Listeners<Presentation>();
  private readonly phases = new Listeners<OnlinePhase>();
  private readonly statuses = new Listeners<SessionStatus>();

  private constructor(
    private readonly deps: OnlineDeps,
    private readonly start: Start,
  ) {
    this.mySeat = start.kind === 'create' ? start.side : start.kind === 'resume' ? start.seat.seat : 'runner';
    if (start.kind === 'resume') {
      this.code = start.seat.code;
      this.token = start.seat.token;
    }
    if (start.kind === 'join') this.code = start.code;
  }

  /** Starts a new game playing `side` (the code arrives with the lobby). */
  static create(deps: OnlineDeps, side: Side, test?: TestSetup): OnlineMatch {
    return new OnlineMatch(deps, test ? { kind: 'create', side, test } : { kind: 'create', side }).open();
  }

  /** Joins the game with this (normalised) code: takes the empty seat. */
  static join(deps: OnlineDeps, code: string): OnlineMatch {
    return new OnlineMatch(deps, { kind: 'join', code }).open();
  }

  /** Takes back a stored seat (Rejoin). */
  static resume(deps: OnlineDeps, seat: StoredSeat): OnlineMatch {
    return new OnlineMatch(deps, { kind: 'resume', seat }).open();
  }

  // ---- Session ----------------------------------------------------------------

  get seat(): Side {
    return this.mySeat;
  }

  view(): PlayerView {
    if (!this.current) throw new Error('no view before the game starts');
    return this.current;
  }

  decision(): null {
    // Each phone decides on its own board: the Corp's rez choice is in the Corp's own view.
    return null;
  }

  lastEvents(): GameEvent[] {
    return this.last.slice();
  }

  status(): SessionStatus {
    return { connection: this.connection, opponent: this.opponent };
  }

  onPresent(cb: (p: Presentation) => void): () => void {
    return this.presented.add(cb);
  }

  /**
   * Sends one action. One at a time: until the server answers it (`ack`),
   * further taps are ignored. No answer in 5 s: reconnect (the catch-up shows
   * whether it happened).
   */
  submit(action: Action): void {
    if (this.phaseNow.kind !== 'playing' || this.connection !== 'open' || this.pending || this.resyncing) return;
    const id = this.nextId++;
    const timer = this.deps.setTimeout(() => {
      if (this.pending?.id === id) this.reconnectNow();
    }, ONLINE_TIMING.ackWait);
    this.pending = { id, timer };
    this.send({ v: 1, t: 'act', id, action });
  }

  // ---- online-only ------------------------------------------------------------

  get phase(): OnlinePhase {
    return this.phaseNow;
  }

  /** The game code (known after `seated`/`lobby`, or from the start for join/resume). */
  get gameCode(): string | null {
    return this.code;
  }

  /** True while a submitted action waits for the server's answer. */
  get busy(): boolean {
    return this.pending !== null;
  }

  onPhase(cb: (p: OnlinePhase) => void): () => void {
    return this.phases.add(cb);
  }

  onStatus(cb: (s: SessionStatus) => void): () => void {
    return this.statuses.add(cb);
  }

  /**
   * The page came back on screen, the app resumed, or the network returned: a
   * dropped socket reconnects at once; an open one is checked with a quick ping.
   */
  wake(): void {
    if (this.stopped) return;
    if (this.socket && this.socket.readyState === OPEN && this.connection === 'open') {
      this.ping(ONLINE_TIMING.wakePongWait);
      return;
    }
    if (this.token) this.reconnectNow();
  }

  /** Leaves this phone's seat (it stays stored, so Rejoin works). */
  leave(): void {
    this.stop();
  }

  /** Leaves and forgets the seat (game over, or a lobby given up). */
  forget(): void {
    this.stop();
    forgetStoredSeat(this.deps.storage);
  }

  // ---- connection ---------------------------------------------------------------

  private open(): this {
    this.connect();
    return this;
  }

  private url(): string {
    const base = this.deps.server.replace(/\/+$/, '');
    if (this.start.kind === 'create' && !this.token) return `${base}${CREATE_PATH}`;
    return `${base}${gamePath(this.code ?? '')}`;
  }

  private connect(): void {
    this.clearTimer('retryTimer');
    let socket: SocketLike;
    try {
      socket = this.deps.connect(this.url());
    } catch {
      this.dropped();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      if (socket !== this.socket) return;
      this.attempt = 0;
      if (this.token) this.send({ v: 1, t: 'resume', token: this.token, since: Math.max(0, this.seq) });
      else if (this.start.kind === 'create') this.send(this.start.test ? { v: 1, t: 'create', side: this.start.side, test: this.start.test } : { v: 1, t: 'create', side: this.start.side });
      else this.send({ v: 1, t: 'join' });
      this.schedulePing();
    };
    socket.onmessage = (ev) => {
      if (socket !== this.socket) return;
      this.receive(ev.data);
    };
    socket.onclose = () => {
      if (socket !== this.socket) return;
      this.dropped();
    };
    socket.onerror = () => {
      // A close always follows.
    };
  }

  private send(msg: ClientMsg): void {
    const s = this.socket;
    if (s && s.readyState === OPEN) s.send(encodeMsg(msg));
  }

  /** The socket is gone (closed by the network or the server without an error message). */
  private dropped(): void {
    this.socket = null;
    this.clearTimer('pingTimer');
    this.clearTimer('pongTimer');
    this.unlock();
    if (this.stopped) return;
    // Before a seat was taken there is nothing to come back to.
    if (!this.token) {
      this.fail('network');
      return;
    }
    this.setConnection('reconnecting');
    const steps = ONLINE_TIMING.backoff;
    const base = Math.min(steps[Math.min(this.attempt, steps.length - 1)]!, ONLINE_TIMING.backoffCap);
    this.attempt++;
    const delay = Math.round(base * (0.8 + 0.4 * this.deps.random()));
    this.retryTimer = this.deps.setTimeout(() => {
      this.retryTimer = null;
      if (!this.stopped) this.connect();
    }, delay);
  }

  /** Drops the current socket and connects again now (stale socket, no ack, coming back). */
  private reconnectNow(): void {
    const old = this.socket;
    this.socket = null;
    this.clearTimer('pingTimer');
    this.clearTimer('pongTimer');
    this.unlock();
    if (old) {
      old.onopen = old.onmessage = old.onclose = old.onerror = null;
      try {
        old.close(1000, 'reconnect');
      } catch {
        // already closed
      }
    }
    if (this.stopped) return;
    this.attempt = 0;
    this.setConnection('reconnecting');
    this.connect();
  }

  private stop(): void {
    this.stopped = true;
    this.clearTimer('retryTimer');
    this.clearTimer('pingTimer');
    this.clearTimer('pongTimer');
    this.unlock();
    const s = this.socket;
    this.socket = null;
    if (s) {
      s.onopen = s.onmessage = s.onclose = s.onerror = null;
      try {
        s.close(1000, 'left');
      } catch {
        // already closed
      }
    }
    this.setConnection('closed');
  }

  private schedulePing(): void {
    this.clearTimer('pingTimer');
    this.pingTimer = this.deps.setTimeout(() => {
      this.pingTimer = null;
      if (this.deps.visible()) this.ping(ONLINE_TIMING.pongWait);
      else this.schedulePing();
    }, ONLINE_TIMING.ping);
  }

  private ping(wait: number): void {
    const s = this.socket;
    if (!s || s.readyState !== OPEN) return;
    s.send(PING);
    this.clearTimer('pongTimer');
    this.pongTimer = this.deps.setTimeout(() => {
      this.pongTimer = null;
      this.reconnectNow();
    }, wait);
  }

  private clearTimer(name: 'retryTimer' | 'pingTimer' | 'pongTimer'): void {
    const t = this[name];
    if (t !== null) this.deps.clearTimeout(t);
    this[name] = null;
  }

  private unlock(): void {
    if (this.pending) this.deps.clearTimeout(this.pending.timer);
    this.pending = null;
  }

  // ---- messages ---------------------------------------------------------------

  private receive(raw: unknown): void {
    const parsed = parseServerMsg(raw);
    if (!parsed.ok) {
      // Another protocol version: this copy of the game is out of date.
      if (parsed.error === 'version') this.fail('version');
      return;
    }
    const msg: ServerMsg = parsed.msg;
    switch (msg.t) {
      case 'seated':
        this.code = msg.code;
        this.mySeat = msg.seat;
        this.token = msg.token;
        this.store();
        return;
      case 'lobby':
        this.code = msg.code;
        this.mySeat = msg.seat;
        this.setConnection('open');
        this.setPhase({ kind: 'lobby', code: msg.code, seat: msg.seat });
        return;
      case 'sync':
        this.resyncing = false;
        this.unlock();
        this.seq = msg.seq;
        this.current = msg.view;
        this.last = [];
        this.opponent = msg.opponent;
        this.setConnection('open');
        this.afterView();
        if (this.phaseNow.kind !== 'playing') this.setPhase({ kind: 'playing' });
        else this.presented.emit({ kind: 'same', view: msg.view, events: [], decision: null });
        this.emitStatus();
        return;
      case 'update': {
        if (this.resyncing || this.phaseNow.kind !== 'playing') return;
        if (msg.seq !== this.seq + 1) {
          // Missed something: ask for the whole state again.
          this.resyncing = true;
          this.unlock();
          if (this.token) this.send({ v: 1, t: 'resume', token: this.token, since: Math.max(0, this.seq) });
          return;
        }
        this.seq = msg.seq;
        this.current = msg.view;
        if (msg.ack !== undefined && this.pending?.id === msg.ack) {
          this.unlock();
          this.last = msg.events.slice();
        }
        this.afterView();
        this.presented.emit({ kind: 'same', view: msg.view, events: msg.events.slice(), decision: null });
        return;
      }
      case 'rejected':
        if (this.pending?.id === msg.ack) this.unlock();
        this.current = msg.view;
        this.last = msg.events.slice();
        this.presented.emit({ kind: 'same', view: msg.view, events: msg.events.slice(), decision: null });
        return;
      case 'presence':
        this.opponent = msg.opponent;
        this.emitStatus();
        return;
      case 'error':
        // bad_message: our message was refused; the socket stays open.
        if (msg.code === 'bad_message') {
          this.unlock();
          return;
        }
        if (msg.code === 'no_game' || msg.code === 'expired' || msg.code === 'bad_token') forgetStoredSeat(this.deps.storage);
        this.fail(msg.code);
        return;
      case 'pong':
        this.clearTimer('pongTimer');
        this.schedulePing();
        return;
    }
  }

  /** A finished game is not offered for Rejoin. */
  private afterView(): void {
    if (this.current?.result) forgetStoredSeat(this.deps.storage);
  }

  private store(): void {
    if (!this.token || !this.code) return;
    const seat: StoredSeat = { server: this.deps.server, code: this.code, seat: this.mySeat, token: this.token };
    try {
      this.deps.storage?.setItem(STORAGE_KEY, JSON.stringify(seat));
    } catch {
      // storage full / unavailable: Rejoin won't be offered
    }
  }

  private fail(reason: FailReason): void {
    this.stop();
    this.setPhase({ kind: 'failed', reason });
  }

  private setPhase(p: OnlinePhase): void {
    this.phaseNow = p;
    this.phases.emit(p);
  }

  private setConnection(c: Connection): void {
    if (this.connection === c) return;
    this.connection = c;
    this.emitStatus();
  }

  private emitStatus(): void {
    this.statuses.emit(this.status());
  }
}

/** Browser dependencies (real WebSocket, localStorage, timers). */
export function browserDeps(server: string): OnlineDeps {
  let storage: StoreLike | null = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  return {
    server,
    connect: (url) => new WebSocket(url) as unknown as SocketLike,
    storage,
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (id) => window.clearTimeout(id as number),
    random: () => Math.random(),
    visible: () => document.visibilityState !== 'hidden',
  };
}
