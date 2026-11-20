/**
 * Sprint 6: the online protocol between a phone (client) and the game server
 * (apps/server). Pure TypeScript, shared by both ends. Depends on engine/cards *types*
 * and `@overclock/match` (deck store format). See packages/engine/README.md "Sprint 6 interface"
 * and "Sprint 14 interface".
 *
 * Every message is one JSON text frame `{ v: PROTOCOL_VERSION, t: <type>, ... }`. The parsers
 * check shapes only (never the rules: the server's engine does that), never
 * throw, and refuse oversized frames.
 */
import type { DeckProblem } from '@overclock/cards';
import type { Action, GameEvent, PlayerView, Side } from '@overclock/engine';
import { MAX_DECK_CARD_ENTRIES, MAX_STORED_COPIES } from '@overclock/match';
import { utf8Length } from './utf8';

export { utf8Length } from './utf8';
export { CODE_ALPHABET, CODE_LENGTH, isGameCode, makeCode, normalizeCode } from './codes';
// Sprint 14: the online deck service (HTTP).
export * from './decks';

/**
 * Sprint 14: the protocol is v2 (own decks online). The constant stays 1 until the room speaks v2
 * (task E4; DECISIONS 2026-11-20): every message type uses `typeof PROTOCOL_VERSION`, so senders
 * must write `v: PROTOCOL_VERSION` (a literal `v: 1` stops compiling when it becomes 2).
 */
export const PROTOCOL_VERSION = 1;
/** The `v` every message carries. */
export type ProtocolVersion = typeof PROTOCOL_VERSION;

/** Largest client → server frame accepted (UTF-8 bytes). */
export const MAX_CLIENT_MESSAGE_BYTES = 8 * 1024;
/** Largest server → client frame accepted (a busy-board view is ~3 KB; views grow with the board, so the client allows headroom). */
export const MAX_SERVER_MESSAGE_BYTES = 512 * 1024;

/** WebSocket paths. */
export const CREATE_PATH = '/v1/create';
export const GAME_PATH_PREFIX = '/v1/games/';
export const HEALTH_PATH = '/health';
export function gamePath(code: string): string {
  return `${GAME_PATH_PREFIX}${code}`;
}

/** Ping / pong are exact strings so the server runtime can answer them without waking the game. */
export const PING = `{"v":${PROTOCOL_VERSION},"t":"ping"}`;
export const PONG = `{"v":${PROTOCOL_VERSION},"t":"pong"}`;

/** Where the client keeps its seat (`StoredSeat`, JSON). */
export const STORAGE_KEY = 'overclock.online.v1';
export interface StoredSeat {
  /** The server's base URL (`wss://…`), so a seat from another build's server is not reused. */
  readonly server: string;
  readonly code: string;
  readonly seat: Side;
  readonly token: string;
  /**
   * Sprint 11 (optional; absent in seats stored by older builds): the engine's `RULES_VERSION` when
   * the seat was stored. Another version = the game can't continue (owner Q3 A): show the note, forget it.
   */
  readonly rulesVersion?: number;
  /** Sprint 11 (optional): when the seat was stored or last played (ms since the epoch), for the Continue row. */
  readonly savedAt?: number;
}

/** `GET /health` answer. */
export interface Health {
  readonly ok: true;
  /** The deployed build id (the git commit in CI, `dev` locally). */
  readonly build: string;
  readonly protocol: typeof PROTOCOL_VERSION;
}

/** Is the other seat's phone connected? `none` = nobody has joined that seat yet. */
export type Presence = 'none' | 'here' | 'away';

export type ErrorCode = 'no_game' | 'full' | 'bad_token' | 'version' | 'bad_message' | 'expired' | 'replaced';
export const ERROR_CODES: readonly ErrorCode[] = ['no_game', 'full', 'bad_token', 'version', 'bad_message', 'expired', 'replaced'];

/**
 * Test mode only (`OVERCLOCK_TEST_MODE=1` on the server): a fixed seed and a prelude of actions.
 * Sprint 8: `deckSet` — `'starter'` keeps legacy specs on the Sprint 7 decks. Sprint 12: default
 * `'core45'` (the 45-card decks); `'core'` = the 30-card Sprint 11 decks (test fixture).
 */
export interface TestSetup {
  readonly seed: number;
  readonly actions: readonly Action[];
  readonly deckSet?: 'core45' | 'core' | 'starter';
}

/**
 * Sprint 14: a player's own deck for an online game, as copy counts (the stored-deck shape). The
 * server deals it with `deckFromCounts` and checks it with `isPlayableDeck`. Absent = the standard deck.
 * Parser: `identity` a non-empty string ≤ 64; ≤ MAX_DECK_CARD_ENTRIES entries; counts whole 1…MAX_STORED_COPIES.
 */
export interface DeckChoice {
  readonly identity: string;
  readonly cards: Readonly<Record<string, number>>;
}

// ---- client → server ----------------------------------------------------------

export type ClientMsg =
  /**
   * On `/v1/create`: start a game; the starter takes `side`. Sprint 14: `deck` = the host's own deck
   * (absent = standard). An illegal deck → `deck_refused` and no game is made (socket stays open).
   */
  | { readonly v: ProtocolVersion; readonly t: 'create'; readonly side: Side; readonly deck?: DeckChoice; readonly test?: TestSetup }
  /** On `/v1/games/<CODE>`: claim the empty seat. */
  | { readonly v: ProtocolVersion; readonly t: 'join' }
  /** On `/v1/games/<CODE>`: take back a seat. `since` = last `seq` seen (0 if none). */
  | { readonly v: ProtocolVersion; readonly t: 'resume'; readonly token: string; readonly since: number }
  /** Submit a move. `id` is the client's own counter, echoed back as `ack`. */
  | { readonly v: ProtocolVersion; readonly t: 'act'; readonly id: number; readonly action: Action }
  /**
   * Sprint 7: the seat gives up a lobby nobody joined: the room closes (sockets closed, storage
   * deleted; the code then answers `no_game`).
   * Sprint 11: in a started game = **leave for now**: the game is kept (`resume` with the token
   * continues it), this socket is closed normally (code 1000, reason `'left'`), and the other seat
   * gets `presence {opponent: 'away', left: true}`.
   */
  | { readonly v: ProtocolVersion; readonly t: 'leave' }
  /**
   * Sprint 14: the joiner's deck, sent after `choose` (absent = standard). Legal → the game is dealt
   * and both seats get `sync`; illegal → `deck_refused` (pick again).
   */
  | { readonly v: ProtocolVersion; readonly t: 'pick'; readonly deck?: DeckChoice }
  | { readonly v: ProtocolVersion; readonly t: 'ping' };

// ---- server → client ----------------------------------------------------------

export type ServerMsg =
  /** After create/join: the client stores `{server, code, seat, token}`. */
  | { readonly v: ProtocolVersion; readonly t: 'seated'; readonly code: string; readonly seat: Side; readonly token: string }
  /** Waiting for the other player to join. Sprint 14: `picking: true` = the friend has joined and is picking a deck. */
  | { readonly v: ProtocolVersion; readonly t: 'lobby'; readonly code: string; readonly seat: Side; readonly picking?: true }
  /** Sprint 14: to the joiner after `seated` (and on resume before the deal): pick a deck for `seat`, then send `pick`. */
  | { readonly v: ProtocolVersion; readonly t: 'choose'; readonly seat: Side }
  /** Sprint 14: only to the sender of an illegal `create`/`pick` deck; `problems` = `checkDeck`'s (or the wrong side's identity). */
  | { readonly v: ProtocolVersion; readonly t: 'deck_refused'; readonly problems: readonly DeckProblem[] }
  /**
   * Full state, no animation (game start, resume, after a gap). Sprint 11: `left: true` when the
   * opponent is away because they chose Leave for now (optional: older builds ignore it).
   */
  | { readonly v: ProtocolVersion; readonly t: 'sync'; readonly seq: number; readonly view: PlayerView; readonly opponent: Presence; readonly left?: true }
  /** One accepted action. `ack` only to the seat that submitted it. */
  | { readonly v: ProtocolVersion; readonly t: 'update'; readonly seq: number; readonly view: PlayerView; readonly events: GameEvent[]; readonly ack?: number }
  /** The submitter's action was refused; `seq` unchanged. */
  | { readonly v: ProtocolVersion; readonly t: 'rejected'; readonly ack: number; readonly view: PlayerView; readonly events: GameEvent[] }
  /** Sprint 11: `left: true` (only with `opponent: 'away'`) = the opponent chose Leave for now; the game is saved. */
  | { readonly v: ProtocolVersion; readonly t: 'presence'; readonly opponent: Presence; readonly left?: true }
  | { readonly v: ProtocolVersion; readonly t: 'error'; readonly code: ErrorCode }
  | { readonly v: ProtocolVersion; readonly t: 'pong' };

export type ClientMsgType = ClientMsg['t'];
export type ServerMsgType = ServerMsg['t'];

/** Parse result: the message, or why it was refused (`version` = a known shape from another protocol version). */
export type Parsed<M> = { readonly ok: true; readonly msg: M } | { readonly ok: false; readonly error: 'version' | 'bad_message' };

// ---- parsers --------------------------------------------------------------------

type Obj = Record<string, unknown>;

const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isSide = (x: unknown): x is Side => x === 'corp' || x === 'runner';
const isUint = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
const isPresence = (x: unknown): x is Presence => x === 'none' || x === 'here' || x === 'away';
/** Sprint 11: the optional `left` flag: absent, or `true` with `opponent: 'away'`. */
const leftOk = (d: Obj): boolean => d.left === undefined || (d.left === true && d.opponent === 'away');
/** An action is any object with a string `type` and a side `player`; the engine checks the rest. */
const isAction = (x: unknown): x is Action => isObj(x) && typeof x.type === 'string' && isSide(x.player);
/** A view or event is checked by the server's engine; the client only needs an object. */
const isView = (x: unknown): x is PlayerView => isObj(x) && isSide(x.viewer);
const isEvents = (x: unknown): x is GameEvent[] => Array.isArray(x) && x.every((e) => isObj(e) && typeof e.type === 'string');

function decode(raw: unknown, maxBytes: number): Obj | 'bad_message' | 'version' {
  if (typeof raw !== 'string' || raw.length > maxBytes || utf8Length(raw) > maxBytes) return 'bad_message';
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return 'bad_message';
  }
  if (!isObj(data) || typeof data.t !== 'string') return 'bad_message';
  if (data.v !== PROTOCOL_VERSION) return 'version';
  return data;
}

function result<M>(d: Obj | 'bad_message' | 'version', check: (d: Obj) => boolean): Parsed<M> {
  if (d === 'bad_message' || d === 'version') return { ok: false, error: d };
  return check(d) ? { ok: true, msg: d as unknown as M } : { ok: false, error: 'bad_message' };
}

function isTestSetup(x: unknown): x is TestSetup {
  return (
    isObj(x) &&
    isUint(x.seed) &&
    x.seed <= 0xffffffff &&
    Array.isArray(x.actions) &&
    x.actions.every(isAction) &&
    (x.deckSet === undefined || x.deckSet === 'core45' || x.deckSet === 'core' || x.deckSet === 'starter')
  );
}

/** Sprint 14: a `DeckChoice` (shape only; the server's `isPlayableDeck` checks the rules). */
export function isDeckChoice(x: unknown): x is DeckChoice {
  if (!isObj(x) || typeof x.identity !== 'string' || x.identity.length === 0 || x.identity.length > 64 || !isObj(x.cards)) return false;
  const entries = Object.entries(x.cards);
  return (
    entries.length <= MAX_DECK_CARD_ENTRIES &&
    entries.every(([id, n]) => id.length > 0 && id.length <= 64 && typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_STORED_COPIES)
  );
}
const deckOk = (d: Obj): boolean => d.deck === undefined || isDeckChoice(d.deck);
/** `deck_refused.problems`: objects with a string `kind` (the client words them with `deckText`). */
const isProblems = (x: unknown): boolean => Array.isArray(x) && x.length <= 500 && x.every((p) => isObj(p) && typeof p.kind === 'string');

const CLIENT_CHECKS: Record<ClientMsgType, (d: Obj) => boolean> = {
  create: (d) => isSide(d.side) && deckOk(d) && (d.test === undefined || isTestSetup(d.test)),
  pick: deckOk,
  join: () => true,
  resume: (d) => typeof d.token === 'string' && d.token.length > 0 && d.token.length <= 64 && isUint(d.since),
  act: (d) => isUint(d.id) && isAction(d.action),
  leave: () => true,
  ping: () => true,
};

const SERVER_CHECKS: Record<ServerMsgType, (d: Obj) => boolean> = {
  seated: (d) => typeof d.code === 'string' && isSide(d.seat) && typeof d.token === 'string',
  lobby: (d) => typeof d.code === 'string' && isSide(d.seat) && (d.picking === undefined || d.picking === true),
  choose: (d) => isSide(d.seat),
  deck_refused: (d) => isProblems(d.problems),
  sync: (d) => isUint(d.seq) && isView(d.view) && isPresence(d.opponent) && leftOk(d),
  update: (d) => isUint(d.seq) && isView(d.view) && isEvents(d.events) && (d.ack === undefined || isUint(d.ack)),
  rejected: (d) => isUint(d.ack) && isView(d.view) && isEvents(d.events),
  presence: (d) => isPresence(d.opponent) && leftOk(d),
  error: (d) => (ERROR_CODES as readonly unknown[]).includes(d.code),
  pong: () => true,
};

/** Parses one client → server frame (server side). Never throws. */
export function parseClientMsg(raw: unknown): Parsed<ClientMsg> {
  const d = decode(raw, MAX_CLIENT_MESSAGE_BYTES);
  return result<ClientMsg>(d, (o) => Object.hasOwn(CLIENT_CHECKS, o.t as string) && CLIENT_CHECKS[o.t as ClientMsgType](o));
}

/** Parses one server → client frame (client side). Never throws. */
export function parseServerMsg(raw: unknown): Parsed<ServerMsg> {
  const d = decode(raw, MAX_SERVER_MESSAGE_BYTES);
  return result<ServerMsg>(d, (o) => Object.hasOwn(SERVER_CHECKS, o.t as string) && SERVER_CHECKS[o.t as ServerMsgType](o));
}

/** Serializes a message (the inverse of the parsers). */
export function encodeMsg(msg: ClientMsg | ServerMsg): string {
  return JSON.stringify(msg);
}

