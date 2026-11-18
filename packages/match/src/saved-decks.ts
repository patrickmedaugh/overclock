/**
 * Sprint 13 (S-13-4): the player's own decks, kept on the device. This file owns the **format**
 * (so a later online service reads the same shape); the client only does the I/O
 * (`apps/client/src/deckStore.ts`, `localStorage['overclock.decks.v1']`).
 *
 * Standard decks are never stored (read-only, ids `'standard-corp'` / `'standard-runner'`).
 * `id` is a random UUID made by the client, so a later upload can merge by id and newest `updatedAt`.
 */
import type { Side } from '@overclock/engine';

/** The deck store layout version. Bump it only if the JSON layout below changes. */
export const DECK_STORE_FORMAT = 1;

/** One saved deck. Lists are copy counts; `deckFromCounts` deals them in a canonical order. */
export interface StoredDeck {
  /** Random UUID made by the client (stable key for a later upload/merge). */
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

export interface DeckStore {
  readonly format: typeof DECK_STORE_FORMAT;
  readonly decks: readonly StoredDeck[];
}

/** Most copies one card may have in a stored deck (a sanity cap: real counts are 0–3; more just isn't Ready). */
export const MAX_STORED_COPIES = 200;

/**
 * Checks the JSON shape of a deck store (`x` may be the parsed object or the raw JSON string).
 * Returns a detached copy, `'broken'` (not a store: the client moves it to `.bak`), or `'newer'`
 * (a newer build's format: shown read-only, never overwritten).
 * - Unknown card ids and over-limit counts are kept (the deck just isn't Ready); counts of 0 are dropped.
 * - A count that is not a whole number in 0…MAX_STORED_COPIES, or any deck field of the wrong type: `'broken'`.
 * - Two decks with the same `id` (e.g. a later merge gone wrong): the one with the newest `updatedAt`
 *   is kept (the first one on a tie), in the place of the first.
 * - Unknown fields (top level or per deck) are dropped.
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
  if (data.format !== DECK_STORE_FORMAT || !Array.isArray(data.decks) || !data.decks.every(isStoredDeck)) return 'broken';
  const byId = new Map<string, StoredDeck>();
  for (const d of data.decks) {
    const cards: Record<string, number> = {};
    for (const [id, n] of Object.entries(d.cards)) if (n > 0) cards[id] = n;
    const copy: StoredDeck = { id: d.id, side: d.side, name: d.name, identity: d.identity, cards, createdAt: d.createdAt, updatedAt: d.updatedAt };
    const seen = byId.get(d.id);
    if (!seen || copy.updatedAt > seen.updatedAt) byId.set(d.id, copy); // Map keeps the first insertion's place
  }
  return { format: DECK_STORE_FORMAT, decks: [...byId.values()] };
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
