/**
 * Sprint 6: the online protocol between a phone (client) and the game server
 * (apps/server). Pure TypeScript, shared by both ends. Depends on engine *types*
 * only. See packages/engine/README.md "Sprint 6 interface".
 *
 * Every message is one JSON text frame `{ v: 1, t: <type>, ... }`. The parsers
 * check shapes only (never the rules: the server's engine does that), never
 * throw, and refuse oversized frames.
 */
import type { Action, GameEvent, PlayerView, Side } from '@overclock/engine';

export const PROTOCOL_VERSION = 1;

/** Largest client → server frame accepted (UTF-8 bytes). */
export const MAX_CLIENT_MESSAGE_BYTES = 8 * 1024;
/** Largest server → client frame accepted (a full view of a busy board is ~10–30 KB). */
export const MAX_SERVER_MESSAGE_BYTES = 512 * 1024;

/** WebSocket paths. */
export const CREATE_PATH = '/v1/create';
export const GAME_PATH_PREFIX = '/v1/games/';
export const HEALTH_PATH = '/health';
export function gamePath(code: string): string {
  return `${GAME_PATH_PREFIX}${code}`;
}

/** Ping / pong are exact strings so the server runtime can answer them without waking the game. */
export const PING = '{"v":1,"t":"ping"}';
export const PONG = '{"v":1,"t":"pong"}';

/** Where the client keeps its seat (`StoredSeat`, JSON). */
export const STORAGE_KEY = 'overclock.online.v1';
export interface StoredSeat {
  /** The server's base URL (`wss://…`), so a seat from another build's server is not reused. */
  readonly server: string;
  readonly code: string;
  readonly seat: Side;
  readonly token: string;
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

/** Test mode only (`OVERCLOCK_TEST_MODE=1` on the server): a fixed seed and a prelude of actions. */
export interface TestSetup {
  readonly seed: number;
  readonly actions: readonly Action[];
}

// ---- client → server ----------------------------------------------------------

export type ClientMsg =
  /** On `/v1/create`: start a game; the starter takes `side`. */
  | { readonly v: 1; readonly t: 'create'; readonly side: Side; readonly test?: TestSetup }
  /** On `/v1/games/<CODE>`: claim the empty seat. */
  | { readonly v: 1; readonly t: 'join' }
  /** On `/v1/games/<CODE>`: take back a seat. `since` = last `seq` seen (0 if none). */
  | { readonly v: 1; readonly t: 'resume'; readonly token: string; readonly since: number }
  /** Submit a move. `id` is the client's own counter, echoed back as `ack`. */
  | { readonly v: 1; readonly t: 'act'; readonly id: number; readonly action: Action }
  | { readonly v: 1; readonly t: 'ping' };

// ---- server → client ----------------------------------------------------------

export type ServerMsg =
  /** After create/join: the client stores `{server, code, seat, token}`. */
  | { readonly v: 1; readonly t: 'seated'; readonly code: string; readonly seat: Side; readonly token: string }
  /** Waiting for the other player to join. */
  | { readonly v: 1; readonly t: 'lobby'; readonly code: string; readonly seat: Side }
  /** Full state, no animation (game start, resume, after a gap). */
  | { readonly v: 1; readonly t: 'sync'; readonly seq: number; readonly view: PlayerView; readonly opponent: Presence }
  /** One accepted action. `ack` only to the seat that submitted it. */
  | { readonly v: 1; readonly t: 'update'; readonly seq: number; readonly view: PlayerView; readonly events: GameEvent[]; readonly ack?: number }
  /** The submitter's action was refused; `seq` unchanged. */
  | { readonly v: 1; readonly t: 'rejected'; readonly ack: number; readonly view: PlayerView; readonly events: GameEvent[] }
  | { readonly v: 1; readonly t: 'presence'; readonly opponent: Presence }
  | { readonly v: 1; readonly t: 'error'; readonly code: ErrorCode }
  | { readonly v: 1; readonly t: 'pong' };

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
/** An action is any object with a string `type` and a side `player`; the engine checks the rest. */
const isAction = (x: unknown): x is Action => isObj(x) && typeof x.type === 'string' && isSide(x.player);
/** A view or event is checked by the server's engine; the client only needs an object. */
const isView = (x: unknown): x is PlayerView => isObj(x) && isSide(x.viewer);
const isEvents = (x: unknown): x is GameEvent[] => Array.isArray(x) && x.every((e) => isObj(e) && typeof e.type === 'string');

/** UTF-8 length of `s` without TextEncoder (not in every runtime's type set). */
export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

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
  return isObj(x) && isUint(x.seed) && x.seed <= 0xffffffff && Array.isArray(x.actions) && x.actions.every(isAction);
}

const CLIENT_CHECKS: Record<ClientMsgType, (d: Obj) => boolean> = {
  create: (d) => isSide(d.side) && (d.test === undefined || isTestSetup(d.test)),
  join: () => true,
  resume: (d) => typeof d.token === 'string' && d.token.length > 0 && d.token.length <= 64 && isUint(d.since),
  act: (d) => isUint(d.id) && isAction(d.action),
  ping: () => true,
};

const SERVER_CHECKS: Record<ServerMsgType, (d: Obj) => boolean> = {
  seated: (d) => typeof d.code === 'string' && isSide(d.seat) && typeof d.token === 'string',
  lobby: (d) => typeof d.code === 'string' && isSide(d.seat),
  sync: (d) => isUint(d.seq) && isView(d.view) && isPresence(d.opponent),
  update: (d) => isUint(d.seq) && isView(d.view) && isEvents(d.events) && (d.ack === undefined || isUint(d.ack)),
  rejected: (d) => isUint(d.ack) && isView(d.view) && isEvents(d.events),
  presence: (d) => isPresence(d.opponent),
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

// ---- game codes -----------------------------------------------------------------

/** No 0/O, 1/I/L: easy to read out loud and type. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;

/** Upper-cases and drops spaces and dashes: `' k7-qf '` → `'K7QF'`. Does not validate. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]+/g, '');
}

/** Exactly CODE_LENGTH characters from CODE_ALPHABET (already normalised). */
export function isGameCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return false;
  return true;
}

/**
 * A random code. `randomInt(n)` must return a uniform integer in [0, n) from a
 * real random source (the server passes `crypto`); the protocol stays pure.
 */
export function makeCode(randomInt: (n: number) => number): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}
