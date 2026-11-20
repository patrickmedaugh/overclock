/**
 * Sprint 14 (S-14-1/2): the online deck service (HTTP, JSON), shared by the client and
 * `apps/server`. Pure TypeScript. See packages/engine/README.md "Sprint 14 interface".
 *
 * The whole deck store is sent every time (a few KB; idempotent), and the server answers with the
 * merged store (`mergeDeckStores`). The deck code travels only in request/response bodies, never
 * in a URL. The server mints codes, so an unknown code is always a wrong guess.
 */
import { checkDeckUpload, MAX_DECK_UPLOAD_BYTES, parseDeckStore, type DeckStore } from '@overclock/match';
import { isCodeOf, makeCodeOf, normalizeCode } from './codes';
import { utf8Length } from './utf8';

export {
  MAX_DECK_CARD_ENTRIES,
  MAX_DECK_ID_LENGTH,
  MAX_DECK_NAME_LENGTH,
  MAX_DECK_UPLOAD_BYTES,
  MAX_STORE_DECKS,
  MAX_STORE_TOMBSTONES,
} from '@overclock/match';

/** The deck API's own version (independent of PROTOCOL_VERSION). Every body carries `v`. */
export const DECKS_API_VERSION = 1;

/** `POST {v, store}` → `200 {v, code, store}`: a new deck locker holding `store`. */
export const DECKS_NEW_PATH = '/v1/decks/new';
/** `POST {v, code, store}` → `200 {v, store}` (merged; the client merges it into its own). */
export const DECKS_SYNC_PATH = '/v1/decks/sync';

/** Test mode only (`OVERCLOCK_TEST_MODE=1`): this header picks the caller's "IP" (= device) for the guess guard. */
export const TEST_IP_HEADER = 'X-Overclock-Test-Ip';

// ---- deck codes ----------------------------------------------------------------------------

/** 12 characters from CODE_ALPHABET (31¹² ≈ 2⁵⁹). */
export const DECK_CODE_LENGTH = 12;
/** Shown in groups of 4: `KX4P-9MTR-QZ7D`. */
export const DECK_CODE_GROUP = 4;

/** A random deck code (server side). `randomInt(n)` = uniform integer in [0, n) from `crypto`. */
export function makeDeckCode(randomInt: (n: number) => number): string {
  return makeCodeOf(DECK_CODE_LENGTH, randomInt);
}

/** Exactly DECK_CODE_LENGTH characters from CODE_ALPHABET (already normalised with `normalizeCode`). */
export function isDeckCode(code: string): boolean {
  return isCodeOf(code, DECK_CODE_LENGTH);
}

/** `'KX4P9MTRQZ7D'` → `'KX4P-9MTR-QZ7D'` (normalises first; shows whatever it is given in groups of 4). */
export function formatDeckCode(code: string): string {
  const c = normalizeCode(code);
  const groups: string[] = [];
  for (let i = 0; i < c.length; i += DECK_CODE_GROUP) groups.push(c.slice(i, i + DECK_CODE_GROUP));
  return groups.join('-');
}

// ---- bodies ----------------------------------------------------------------------------------

export interface DeckNewRequest {
  readonly v: typeof DECKS_API_VERSION;
  readonly store: DeckStore;
}
export interface DeckSyncRequest {
  readonly v: typeof DECKS_API_VERSION;
  /** Normalised (no dashes). */
  readonly code: string;
  readonly store: DeckStore;
}
export interface DeckNewReply {
  readonly v: typeof DECKS_API_VERSION;
  readonly code: string;
  readonly store: DeckStore;
}
export interface DeckSyncReply {
  readonly v: typeof DECKS_API_VERSION;
  readonly store: DeckStore;
}

/**
 * Why a request was refused. A refused request changes nothing stored.
 * - `no_decks` (404): no locker with that code (a wrong guess; counts toward the guess guard).
 * - `wait` (429): too many wrong codes (or new lockers) from this device; `retryAfterMs` says how long.
 * - `bad_store` (400): `checkDeckUpload` said `broken`/`newer`, or the body isn't valid JSON / shape.
 * - `too_big` (413): over MAX_DECK_UPLOAD_BYTES or another size limit.
 * - `version` (400): another `DECKS_API_VERSION`.
 */
export type DeckApiError = 'no_decks' | 'wait' | 'bad_store' | 'too_big' | 'version';
export const DECK_API_ERRORS: readonly DeckApiError[] = ['no_decks', 'wait', 'bad_store', 'too_big', 'version'];
export const DECK_API_STATUS: Readonly<Record<DeckApiError, number>> = { no_decks: 404, wait: 429, bad_store: 400, too_big: 413, version: 400 };

/** Error body (any non-200). `retryAfterMs` only with `wait`. */
export interface DeckErrorReply {
  readonly v: typeof DECKS_API_VERSION;
  readonly error: DeckApiError;
  readonly retryAfterMs?: number;
}

// ---- client: reading a reply -----------------------------------------------------------------

/** A reply as the client sees it. `bad_reply` = not a reply this build understands. */
export type DeckReply =
  | { readonly ok: true; readonly store: DeckStore; readonly code?: string }
  | { readonly ok: false; readonly error: DeckApiError | 'bad_reply'; readonly retryAfterMs?: number };

/**
 * Reads a deck API reply (`body` = response text or parsed JSON). For `200` the store is checked
 * with `parseDeckStore` (a `newer`/`broken` store → `bad_reply`); `code` is returned when present
 * and valid (always for `new`). Never throws.
 */
export function parseDeckReply(status: number, body: unknown): DeckReply {
  let data = body;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data) as unknown;
    } catch {
      return { ok: false, error: 'bad_reply' };
    }
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return { ok: false, error: 'bad_reply' };
  const d = data as Record<string, unknown>;
  if (d.v !== DECKS_API_VERSION) return { ok: false, error: d.error === 'version' ? 'version' : 'bad_reply' };
  if (status === 200) {
    const store = parseDeckStore(d.store);
    if (store === 'broken' || store === 'newer') return { ok: false, error: 'bad_reply' };
    if (d.code === undefined) return { ok: true, store };
    if (typeof d.code !== 'string' || !isDeckCode(d.code)) return { ok: false, error: 'bad_reply' };
    return { ok: true, store, code: d.code };
  }
  if (!(DECK_API_ERRORS as readonly unknown[]).includes(d.error)) return { ok: false, error: 'bad_reply' };
  const error = d.error as DeckApiError;
  if (error === 'wait') {
    const ms = d.retryAfterMs;
    return { ok: false, error, retryAfterMs: typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 ? ms : 60_000 };
  }
  return { ok: false, error };
}

// ---- server: reading a request ---------------------------------------------------------------

export type DeckRequest = { readonly ok: true; readonly code?: string; readonly store: DeckStore } | { readonly ok: false; readonly error: DeckApiError };

/**
 * Reads a request body (`raw` = the body text). `kind` = which path. Checks size (`too_big`),
 * JSON and `v` (`version`), the code's form for `sync` (a malformed code = `no_decks`, i.e. a wrong
 * guess), and the store with `checkDeckUpload`. Never throws.
 */
export function parseDeckRequest(kind: 'new' | 'sync', raw: string): DeckRequest {
  if (raw.length > MAX_DECK_UPLOAD_BYTES || utf8Length(raw) > MAX_DECK_UPLOAD_BYTES) return { ok: false, error: 'too_big' };
  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, error: 'bad_store' };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return { ok: false, error: 'bad_store' };
  const d = data as Record<string, unknown>;
  if (d.v !== DECKS_API_VERSION) return { ok: false, error: 'version' };
  let code: string | undefined;
  if (kind === 'sync') {
    if (typeof d.code !== 'string') return { ok: false, error: 'bad_store' };
    code = normalizeCode(d.code);
    if (!isDeckCode(code)) return { ok: false, error: 'no_decks' };
  }
  const store = checkDeckUpload(d.store);
  if (store === 'too_big') return { ok: false, error: 'too_big' };
  if (store === 'broken' || store === 'newer') return { ok: false, error: 'bad_store' };
  return code === undefined ? { ok: true, store } : { ok: true, code, store };
}

// ---- client: what the device remembers --------------------------------------------------------

/** `localStorage` key of `StoredDeckSync` (JSON). */
export const DECK_SYNC_STORAGE_KEY = 'overclock.deckSync.v1';
export interface StoredDeckSync {
  /** The deck service's base URL (`https://…`), so a code from another build's server is not reused. */
  readonly server: string;
  /** Normalised deck code; absent until the first `new` (or a link). */
  readonly code?: string;
  /** Bumped by every local deck write (not by merging the server's answer). */
  readonly rev: number;
  /** The `rev` the server has. `rev > syncedRev` = changes waiting to go online. */
  readonly syncedRev: number;
  /** ms since epoch: "I have a deck code" is disabled until then (after a `wait`). */
  readonly lockUntil?: number;
}
