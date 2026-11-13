/**
 * Sprint 6: one online game ("room"), as pure logic. No `cloudflare:` imports: the
 * clock, randomness, storage and sockets are injected, so this runs in plain Vitest.
 * `do.ts` wraps it in a Durable Object (one per game code).
 *
 * The room owns a `LocalMatch` (rezWindow 'always') and talks to each seat only with
 * protocol messages built from `match.view(seat)` and the match's per-seat projected
 * events. Nothing else about the game ever reaches a socket.
 *
 * All handlers are synchronous: the Durable Object runs one event at a time, so a
 * handler can't interleave with another socket's message.
 */
import type { Action, GameOptions, GameState, PlayerView, Side } from '@overclock/engine';
import { LocalMatch, type MatchUpdate } from '@overclock/match';
import { encodeMsg, parseClientMsg, PROTOCOL_VERSION, type ClientMsg, type ErrorCode, type Presence, type ServerMsg } from '@overclock/protocol';
import { base64url, sha256Hex } from './hash';

export const ONLINE_OPTIONS: GameOptions = { rezWindow: 'always' };

/** Cleanup: a lobby nobody joined, an idle game, a finished game. */
export const LOBBY_TTL_MS = 2 * 60 * 60 * 1000;
export const IDLE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
export const FINISHED_TTL_MS = 60 * 60 * 1000;
/** The room answers Don't rez for a Corp that can only pass, after a random pause in [MIN, MAX]. */
export const AUTO_PASS_MIN_MS = 1200;
export const AUTO_PASS_MAX_MS = 2400;

/** WebSocket close codes the room uses (4000–4999 are application codes). */
export const CLOSE_ERROR = 4000;
export const CLOSE_NORMAL = 1000;

const SIDES: readonly Side[] = ['corp', 'runner'];
const other = (s: Side): Side => (s === 'corp' ? 'runner' : 'corp');

/** Synchronous key-value storage (the SQLite-backed Durable Object's `ctx.storage.kv`). */
export interface RoomStore {
  get<T>(key: string): T | undefined;
  put(key: string, value: unknown): void;
  /** Entries whose key starts with `prefix`, in key order. */
  list<T>(prefix: string): [string, T][];
  /** Removes everything (the game is gone; its code is free again). */
  deleteAll(): void;
}

export interface RoomDeps {
  /** Milliseconds since the epoch. */
  now(): number;
  /** A uniform float in [0, 1) from a real random source (seeds, auto-pass delay). */
  random(): number;
  /** `n` random bytes from a real random source (seat tokens). */
  randomBytes(n: number): Uint8Array;
  /** This deployment's build id; a snapshot from another build is not trusted (replayed instead). */
  build: string;
  /** `OVERCLOCK_TEST_MODE=1`: `create` may carry a seed and a prelude of actions. */
  testMode: boolean;
}

/** What a socket is to the room. Persisted on the socket by the wrapper (hibernation). */
export type ConnRole = { kind: 'creator'; code: string } | { kind: 'player' } | { kind: 'seat'; seat: Side };

/** One socket, as the room sees it. */
export interface Conn {
  send(text: string): void;
  close(code: number, reason: string): void;
  /** Called whenever the room changes the socket's role; the wrapper stores it on the socket. */
  setRole(role: ConnRole): void;
}

/** Stored under `meta`. */
export interface RoomMeta {
  code: string;
  seed: number;
  hostSide: Side;
  /** SHA-256 (hex) of each claimed seat's token. */
  tokenHashes: Partial<Record<Side, string>>;
  options: GameOptions;
  createdAt: number;
  /** Time of the last accepted action (or the join). */
  lastActive: number;
  /** The build that wrote the `state` snapshot. */
  build: string;
}

const actionKey = (seq: number) => `a:${String(seq).padStart(6, '0')}`;

export class Room {
  private meta: RoomMeta | null = null;
  private match: LocalMatch | null = null;
  /** Accepted actions, in order (`seq` = its length). */
  private accepted: Action[] = [];
  private readonly roles = new Map<Conn, ConnRole>();
  private readonly seats: Partial<Record<Side, Conn>> = {};
  /** When the room will answer `pass` for the Corp (null: not waiting). In memory only. */
  private autoPassAt: number | null = null;

  constructor(
    private readonly store: RoomStore,
    private readonly deps: RoomDeps,
  ) {
    this.restore();
  }

  // ---- queries -----------------------------------------------------------------

  /** True when nobody has started a game here and no creator socket holds the room. */
  canCreate(): boolean {
    return this.meta === null && ![...this.roles.values()].some((r) => r.kind === 'creator');
  }

  /** When the wrapper must call `alarm()` next (auto-pass or cleanup), or null. */
  nextWakeAt(): number | null {
    if (!this.meta) return null;
    const expiry = this.expiresAt();
    return this.autoPassAt !== null ? Math.min(this.autoPassAt, expiry) : expiry;
  }

  /** The current sequence number (accepted actions). */
  seq(): number {
    return this.accepted.length;
  }

  // ---- socket events ----------------------------------------------------------------

  /** A new socket. `creator` sockets came in on `/v1/create` for `code` (call only when `canCreate()`). */
  connect(conn: Conn, role: { kind: 'creator'; code: string } | { kind: 'player' }): void {
    this.setRole(conn, role);
  }

  /** After a wake from hibernation: a socket that was already open, with its stored role. Sends nothing. */
  reattach(conn: Conn, role: ConnRole): void {
    if (role.kind === 'seat') {
      if (!this.meta?.tokenHashes[role.seat] || this.seats[role.seat]) {
        conn.close(CLOSE_ERROR, 'replaced');
        return;
      }
      this.seats[role.seat] = conn;
    }
    this.roles.set(conn, role);
  }

  message(conn: Conn, raw: unknown): void {
    if (!this.roles.has(conn)) return;
    const parsed = parseClientMsg(raw);
    if (!parsed.ok) {
      if (parsed.error === 'version') this.fail(conn, 'version');
      else this.send(conn, { v: 1, t: 'error', code: 'bad_message' });
      return;
    }
    const msg = parsed.msg;
    if (msg.t === 'ping') {
      this.send(conn, { v: 1, t: 'pong' });
      return;
    }
    const role = this.roles.get(conn)!;
    switch (msg.t) {
      case 'create':
        if (role.kind === 'creator' && !this.meta) this.create(conn, role.code, msg);
        else this.send(conn, { v: 1, t: 'error', code: 'bad_message' });
        return;
      case 'join':
        if (role.kind === 'player') this.join(conn);
        else this.send(conn, { v: 1, t: 'error', code: 'bad_message' });
        return;
      case 'resume':
        if (role.kind !== 'creator') this.resume(conn, msg.token);
        else this.send(conn, { v: 1, t: 'error', code: 'bad_message' });
        return;
      case 'act':
        if (role.kind === 'seat' && this.started()) this.act(role.seat, msg.action, msg.id);
        else this.send(conn, { v: 1, t: 'error', code: 'bad_message' });
        return;
    }
  }

  /** The socket closed (or errored). */
  disconnect(conn: Conn): void {
    const role = this.roles.get(conn);
    this.roles.delete(conn);
    if (role?.kind !== 'seat' || this.seats[role.seat] !== conn) return;
    delete this.seats[role.seat];
    this.tellPresence(other(role.seat));
    // An away Corp is never passed for (see corpCanOnlyPass); a fresh pause starts when it is back.
    this.scheduleAutoPass();
  }

  /** The Durable Object alarm fired: clean up an expired game, or answer the Corp's pass. */
  alarm(): void {
    if (!this.meta) return;
    const now = this.deps.now();
    if (now >= this.expiresAt()) {
      this.expire();
      return;
    }
    // `autoPassAt === null` here means the room was evicted while waiting (the alarm was the auto-pass).
    if (this.corpCanOnlyPass() && (this.autoPassAt === null || now >= this.autoPassAt)) {
      this.autoPassAt = null;
      this.act('corp', { type: 'pass', player: 'corp' }, null);
      return;
    }
    this.scheduleAutoPass();
  }

  // ---- handlers -------------------------------------------------------------------

  private create(conn: Conn, code: string, msg: Extract<ClientMsg, { t: 'create' }>): void {
    const now = this.deps.now();
    const test = this.deps.testMode ? msg.test : undefined;
    const seed = test ? test.seed : Math.floor(this.deps.random() * 0x100000000) >>> 0;
    const match = new LocalMatch(seed, ONLINE_OPTIONS);
    const accepted: Action[] = [];
    for (const a of test?.actions ?? []) {
      const u = match.submit(a.player, a);
      if (!isRejected(u, a.player)) accepted.push(JSON.parse(JSON.stringify(a)) as Action);
    }
    const token = this.newToken();
    this.meta = {
      code,
      seed,
      hostSide: msg.side,
      tokenHashes: { [msg.side]: sha256Hex(token) },
      options: match.options,
      createdAt: now,
      lastActive: now,
      build: this.deps.build,
    };
    this.match = match;
    this.accepted = accepted;
    accepted.forEach((a, i) => this.store.put(actionKey(i + 1), a));
    this.store.put('state', match.snapshot());
    this.store.put('meta', this.meta);
    this.seat(conn, msg.side);
    this.send(conn, { v: 1, t: 'seated', code, seat: msg.side, token });
    this.send(conn, { v: 1, t: 'lobby', code, seat: msg.side });
  }

  private join(conn: Conn): void {
    const meta = this.meta;
    if (!meta) return this.fail(conn, 'no_game');
    const seat = other(meta.hostSide);
    if (meta.tokenHashes[seat]) return this.fail(conn, 'full');
    const token = this.newToken();
    meta.tokenHashes[seat] = sha256Hex(token);
    meta.lastActive = this.deps.now();
    this.store.put('meta', meta);
    this.seat(conn, seat);
    this.send(conn, { v: 1, t: 'seated', code: meta.code, seat, token });
    for (const s of SIDES) this.sync(s);
    this.scheduleAutoPass();
  }

  private resume(conn: Conn, token: string): void {
    const meta = this.meta;
    if (!meta) return this.fail(conn, 'no_game');
    const hash = sha256Hex(token);
    const seat = SIDES.find((s) => meta.tokenHashes[s] === hash);
    if (!seat) return this.fail(conn, 'bad_token');
    const old = this.seats[seat];
    if (old && old !== conn) {
      this.roles.delete(old);
      delete this.seats[seat];
      this.fail(old, 'replaced');
    }
    const role = this.roles.get(conn);
    if (role?.kind === 'seat' && role.seat !== seat) {
      // A socket switching seats (both tokens on one phone): leave the old seat first.
      this.disconnect(conn);
      this.roles.set(conn, { kind: 'player' });
    }
    const fresh = this.seats[seat] !== conn;
    this.seat(conn, seat);
    if (!this.started()) {
      this.send(conn, { v: 1, t: 'lobby', code: meta.code, seat });
      return;
    }
    this.sync(seat);
    if (fresh) this.tellPresence(other(seat));
    this.scheduleAutoPass();
  }

  /** Submits `action` for `seat`; `ack` = the client's id (null: the room's own auto-pass). */
  private act(seat: Side, action: Action, ack: number | null): void {
    const match = this.match!;
    const u = match.submit(seat, action);
    if (isRejected(u, seat)) {
      const conn = this.seats[seat];
      if (conn && ack !== null) this.send(conn, { v: 1, t: 'rejected', ack, view: u[seat].view, events: u[seat].events });
      return;
    }
    this.accepted.push(JSON.parse(JSON.stringify(action)) as Action);
    const seq = this.accepted.length;
    const meta = this.meta!;
    meta.lastActive = this.deps.now();
    this.store.put(actionKey(seq), this.accepted[seq - 1]);
    this.store.put('state', match.snapshot());
    this.store.put('meta', meta);
    for (const s of SIDES) {
      const conn = this.seats[s];
      if (!conn) continue;
      const msg: ServerMsg =
        s === seat && ack !== null
          ? { v: 1, t: 'update', seq, view: u[s].view, events: u[s].events, ack }
          : { v: 1, t: 'update', seq, view: u[s].view, events: u[s].events };
      this.send(conn, msg);
    }
    this.autoPassAt = null;
    this.scheduleAutoPass();
  }

  // ---- helpers ----------------------------------------------------------------------

  private restore(): void {
    const meta = this.store.get<RoomMeta>('meta');
    if (!meta) return;
    const actions = this.store.list<Action>('a:').map(([, a]) => a);
    const snapshot = this.store.get<GameState>('state');
    if (snapshot && meta.build === this.deps.build) {
      this.match = LocalMatch.fromSnapshot(meta.seed, snapshot, actions);
    } else {
      // Another build wrote the snapshot (a deploy mid-game): rebuild under this build's rules.
      this.match = LocalMatch.restore(meta.seed, actions, meta.options);
      meta.build = this.deps.build;
      this.store.put('state', this.match.snapshot());
      this.store.put('meta', meta);
    }
    this.meta = meta;
    this.accepted = actions;
  }

  /** Both seats claimed. */
  private started(): boolean {
    return !!this.meta && SIDES.every((s) => this.meta!.tokenHashes[s]);
  }

  private view(seat: Side): PlayerView {
    return this.match!.view(seat);
  }

  private presenceOf(seat: Side): Presence {
    if (!this.meta?.tokenHashes[seat]) return 'none';
    return this.seats[seat] ? 'here' : 'away';
  }

  private sync(seat: Side): void {
    const conn = this.seats[seat];
    if (conn) this.send(conn, { v: 1, t: 'sync', seq: this.seq(), view: this.view(seat), opponent: this.presenceOf(other(seat)) });
  }

  /** Tells `seat` where its opponent is (only in a started game). */
  private tellPresence(seat: Side): void {
    const conn = this.seats[seat];
    if (conn && this.started()) this.send(conn, { v: 1, t: 'presence', opponent: this.presenceOf(other(seat)) });
  }

  private seat(conn: Conn, seat: Side): void {
    this.seats[seat] = conn;
    this.setRole(conn, { kind: 'seat', seat });
  }

  private setRole(conn: Conn, role: ConnRole): void {
    this.roles.set(conn, role);
    conn.setRole(role);
  }

  private send(conn: Conn, msg: ServerMsg): void {
    try {
      conn.send(encodeMsg(msg));
    } catch {
      // A socket that is already closing: its close event will clean up.
    }
  }

  /** Sends `error{code}` and closes the socket. */
  private fail(conn: Conn, code: ErrorCode): void {
    this.send(conn, { v: PROTOCOL_VERSION, t: 'error', code });
    this.roles.delete(conn);
    try {
      conn.close(CLOSE_ERROR, code);
    } catch {
      // already closed
    }
  }

  private newToken(): string {
    return base64url(this.deps.randomBytes(16));
  }

  private gameOver(): boolean {
    return this.match?.view('corp').phase === 'over';
  }

  private expiresAt(): number {
    const meta = this.meta!;
    if (!this.started()) return meta.createdAt + LOBBY_TTL_MS;
    if (this.gameOver()) return meta.lastActive + FINISHED_TTL_MS;
    return meta.lastActive + IDLE_TTL_MS;
  }

  private expire(): void {
    for (const conn of [...this.roles.keys()]) this.fail(conn, 'expired');
    for (const s of SIDES) delete this.seats[s];
    this.store.deleteAll();
    this.meta = null;
    this.match = null;
    this.accepted = [];
    this.autoPassAt = null;
  }

  /**
   * At an approach the Corp can't pay for, its only legal move is Don't rez (`pass`).
   * Only while the Corp's phone is connected: an away Corp who *could* pay stalls the run,
   * so passing for an away Corp who can't would tell the Runner the ICE costs more than the
   * Corp has (architect review, S-06-2 AC5). Both cases now wait for the Corp to come back.
   */
  private corpCanOnlyPass(): boolean {
    if (!this.started() || !this.match || !this.seats.corp) return false;
    const v = this.match.view('corp');
    return v.run?.step === 'approach' && v.legalActions.length === 1 && v.legalActions[0]!.type === 'pass';
  }

  private scheduleAutoPass(): void {
    if (!this.corpCanOnlyPass()) {
      this.autoPassAt = null;
      return;
    }
    if (this.autoPassAt !== null) return;
    const span = AUTO_PASS_MAX_MS - AUTO_PASS_MIN_MS;
    this.autoPassAt = this.deps.now() + AUTO_PASS_MIN_MS + Math.floor(this.deps.random() * (span + 1));
  }
}

function isRejected(u: MatchUpdate, seat: Side): boolean {
  return u[seat].events.some((e) => e.type === 'action_rejected');
}
