/**
 * Sprint 13 (S-13-4): the player's own decks, kept on the device. This file owns the **format**
 * (so the online deck service reads the same shape); the client only does the I/O
 * (`apps/client/src/deckStore.ts`, `localStorage['overclock.decks.v1']`).
 *
 * Standard decks are never stored (read-only, ids `'standard-corp'` / `'standard-runner'`).
 * `id` is a random UUID made by the client, so an upload can merge by id and newest time.
 *
 * Sprint 14 (S-14-1/2): format 2 = format 1 + `deleted` (tombstones), so a delete reaches other
 * devices and a stale copy can't bring a deleted deck back. One pure merge rule
 * (`mergeDeckStores`) and one upload check (`checkDeckUpload`), shared by the client and the server.
 */
import type { Side } from '@overclock/engine';

/** The deck store layout version. Bump it only if the JSON layout below changes. Sprint 14: 2 (reads 1). */
export const DECK_STORE_FORMAT = 2;

/** One saved deck. Lists are copy counts; `deckFromCounts` deals them in a canonical order. */
export interface StoredDeck {
  /** Random UUID made by the client (stable key for upload/merge). */
  readonly id: string;
  readonly side: Side;
  readonly name: string;
  /** Identity card id. */
  readonly identity: string;
  /** Card id → copies. Unknown ids are kept (the deck just isn't Ready). */
  readonly cards: Readonly<Record<string, number>>;
  /** ms since epoch. */
  readonly createdAt: number;
  /** ms since epoch. */
  readonly updatedAt: number;
}

/** Sprint 14: a deleted deck's marker, so the delete wins over older copies elsewhere. */
export interface DeckTombstone {
  readonly id: string;
  /** ms since epoch (device clock). */
  readonly deletedAt: number;
}

export interface DeckStore {
  readonly format: typeof DECK_STORE_FORMAT;
  readonly decks: readonly StoredDeck[];
  /** Sprint 14: tombstones. Each id appears at most once in `decks` + `deleted` (after `parseDeckStore`). */
  readonly deleted: readonly DeckTombstone[];
}

/** Most copies one card may have in a stored deck (a sanity cap: real counts are 0–3; more just isn't Ready). */
export const MAX_STORED_COPIES = 200;

// ---- Sprint 14 upload limits (re-exported by `@overclock/protocol` decks.ts) ----------------

/** Largest upload body (UTF-8 bytes of the whole JSON request). */
export const MAX_DECK_UPLOAD_BYTES = 256 * 1024;
/** Most decks in one store. */
export const MAX_STORE_DECKS = 200;
/** Most tombstones kept; beyond this the oldest are dropped (not refused). */
export const MAX_STORE_TOMBSTONES = 500;
/** Longest deck id (UTF-16 length). */
export const MAX_DECK_ID_LENGTH = 64;
/** Longest deck name (UTF-16 length). */
export const MAX_DECK_NAME_LENGTH = 80;
/** Most card entries (distinct ids) in one deck. */
export const MAX_DECK_CARD_ENTRIES = 100;

/**
 * Checks the JSON shape of a deck store (`x` may be the parsed object or the raw JSON string).
 * Returns a detached copy **in format 2**, `'broken'` (not a store: the client moves it to `.bak`),
 * or `'newer'` (a newer build's format: shown read-only, never overwritten).
 * - Reads formats 1 (no tombstones; any `deleted` field is ignored) and 2 (`deleted` required).
 * - Unknown card ids and over-limit counts are kept (the deck just isn't Ready); counts of 0 are dropped.
 * - A count that is not a whole number in 0…MAX_STORED_COPIES, or any field of the wrong type: `'broken'`.
 * - Two decks with the same `id`: the one with the newest `updatedAt` is kept (the first one on a
 *   tie), in the place of the first. Two tombstones with the same id: the newest `deletedAt`.
 * - A deck and a tombstone with the same id: the newer wins (tie → the tombstone), as in `mergeDeckStores`.
 * - Unknown fields (top level, per deck, per tombstone) are dropped.
 */
export function parseDeckStore(x: unknown): DeckStore | 'broken' | 'newer' {
  let data = x;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data) as unknown;
    } catch {
      return 'broken';
    }
  }
  if (!isObj(data)) return 'broken';
  if (typeof data.format === 'number' && Number.isInteger(data.format) && data.format > DECK_STORE_FORMAT) return 'newer';
  if (data.format !== 1 && data.format !== 2) return 'broken';
  if (!Array.isArray(data.decks) || !data.decks.every(isStoredDeck)) return 'broken';
  const rawDeleted: unknown = data.format === 2 ? data.deleted : [];
  if (!Array.isArray(rawDeleted) || !rawDeleted.every(isTombstone)) return 'broken';
  const byId = new Map<string, StoredDeck>();
  for (const d of data.decks) {
    const copy = copyDeck(d);
    const seen = byId.get(d.id);
    if (!seen || copy.updatedAt > seen.updatedAt) byId.set(d.id, copy); // Map keeps the first insertion's place
  }
  const tombs = new Map<string, DeckTombstone>();
  for (const t of rawDeleted) {
    const seen = tombs.get(t.id);
    if (!seen || t.deletedAt > seen.deletedAt) tombs.set(t.id, { id: t.id, deletedAt: t.deletedAt });
  }
  for (const [id, t] of tombs) {
    const d = byId.get(id);
    if (!d) continue;
    if (t.deletedAt >= d.updatedAt) byId.delete(id);
    else tombs.delete(id);
  }
  return { format: DECK_STORE_FORMAT, decks: [...byId.values()], deleted: [...tombs.values()] };
}

/**
 * Sprint 14: the one merge rule (client and server). Per id, the newest of `updatedAt` (a deck) or
 * `deletedAt` (a tombstone) wins; on a tie a tombstone beats a deck, then the smaller canonical JSON
 * wins. Commutative, associative and idempotent (it is a max over a total order per id).
 * Output order is canonical: decks by `createdAt`, then `id`; tombstones by `id`.
 * Inputs should be parsed stores (`parseDeckStore`); the result is detached.
 */
export function mergeDeckStores(a: DeckStore, b: DeckStore): DeckStore {
  const best = new Map<string, Entry>();
  const consider = (e: Entry): void => {
    const cur = best.get(e.id);
    if (!cur || beats(e, cur)) best.set(e.id, e);
  };
  for (const s of [a, b]) {
    for (const d of s.decks) consider({ id: d.id, time: d.updatedAt, deck: d, json: canonicalJson(d) });
    for (const t of s.deleted) consider({ id: t.id, time: t.deletedAt, deck: null, json: '' });
  }
  const decks: StoredDeck[] = [];
  const deleted: DeckTombstone[] = [];
  for (const e of best.values()) {
    if (e.deck) decks.push(copyDeck(e.deck));
    else deleted.push({ id: e.id, deletedAt: e.time });
  }
  decks.sort((x, y) => x.createdAt - y.createdAt || cmp(x.id, y.id));
  deleted.sort((x, y) => cmp(x.id, y.id));
  return { format: DECK_STORE_FORMAT, decks, deleted };
}

/** Why `checkDeckUpload` refused a store. `broken`/`newer` as `parseDeckStore`; `too_big` = a size limit. */
export type UploadProblem = 'broken' | 'newer' | 'too_big';

/**
 * Sprint 14: the shared upload check (the server refuses, the client never sends, what this refuses).
 * `parseDeckStore` (must not be `broken`/`newer`) plus limits:
 * - JSON text over MAX_DECK_UPLOAD_BYTES, or more than MAX_STORE_DECKS decks → `'too_big'`;
 * - an id over MAX_DECK_ID_LENGTH (deck or tombstone), a name over MAX_DECK_NAME_LENGTH, or a deck
 *   with more than MAX_DECK_CARD_ENTRIES card entries → `'broken'`;
 * - more than MAX_STORE_TOMBSTONES tombstones: the oldest are dropped (newest kept; tie → smaller id).
 * Unknown card ids and 4+ copies are kept (a store is not a game).
 */
export function checkDeckUpload(x: unknown): DeckStore | UploadProblem {
  let text: string | undefined;
  try {
    text = typeof x === 'string' ? x : JSON.stringify(x);
  } catch {
    return 'broken';
  }
  if (text === undefined) return 'broken';
  if (text.length > MAX_DECK_UPLOAD_BYTES || utf8Length(text) > MAX_DECK_UPLOAD_BYTES) return 'too_big';
  const store = parseDeckStore(text);
  if (store === 'broken' || store === 'newer') return store;
  if (store.decks.length > MAX_STORE_DECKS) return 'too_big';
  for (const d of store.decks) {
    if (d.id.length > MAX_DECK_ID_LENGTH || d.name.length > MAX_DECK_NAME_LENGTH) return 'broken';
    if (Object.keys(d.cards).length > MAX_DECK_CARD_ENTRIES) return 'broken';
  }
  if (store.deleted.some((t) => t.id.length > MAX_DECK_ID_LENGTH)) return 'broken';
  if (store.deleted.length <= MAX_STORE_TOMBSTONES) return store;
  const keep = new Set(
    [...store.deleted]
      .sort((p, q) => q.deletedAt - p.deletedAt || cmp(p.id, q.id))
      .slice(0, MAX_STORE_TOMBSTONES)
      .map((t) => t.id),
  );
  return { ...store, deleted: store.deleted.filter((t) => keep.has(t.id)) };
}

// ---- helpers ---------------------------------------------------------------------------------

interface Entry {
  readonly id: string;
  readonly time: number;
  /** null = a tombstone. */
  readonly deck: StoredDeck | null;
  /** Canonical JSON of the deck ('' for a tombstone). */
  readonly json: string;
}

/** Does `e` win over `cur` (same id)? Newer time; tie → tombstone; then smaller canonical JSON. */
function beats(e: Entry, cur: Entry): boolean {
  if (e.time !== cur.time) return e.time > cur.time;
  if (!e.deck !== !cur.deck) return !e.deck;
  return cmp(e.json, cur.json) < 0;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** JSON of a deck with fixed key order (cards sorted by id), so equal decks give equal text. */
function canonicalJson(d: StoredDeck): string {
  const cards = Object.keys(d.cards)
    .sort(cmp)
    .map((k) => [k, d.cards[k]]);
  return JSON.stringify([d.id, d.side, d.name, d.identity, cards, d.createdAt, d.updatedAt]);
}

function copyDeck(d: StoredDeck): StoredDeck {
  const cards: Record<string, number> = {};
  for (const [id, n] of Object.entries(d.cards)) if (n > 0) cards[id] = n;
  return { id: d.id, side: d.side, name: d.name, identity: d.identity, cards, createdAt: d.createdAt, updatedAt: d.updatedAt };
}

/** UTF-8 length of `s` without TextEncoder (not in every runtime's type set). */
function utf8Length(s: string): number {
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

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isTime = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const isCounts = (x: unknown): x is Record<string, number> =>
  isObj(x) && Object.values(x).every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_STORED_COPIES);
const isStoredDeck = (x: unknown): x is StoredDeck =>
  isObj(x) &&
  typeof x.id === 'string' &&
  x.id.length > 0 &&
  (x.side === 'corp' || x.side === 'runner') &&
  typeof x.name === 'string' &&
  typeof x.identity === 'string' &&
  isCounts(x.cards) &&
  isTime(x.createdAt) &&
  isTime(x.updatedAt);
const isTombstone = (x: unknown): x is DeckTombstone => isObj(x) && typeof x.id === 'string' && x.id.length > 0 && isTime(x.deletedAt);
