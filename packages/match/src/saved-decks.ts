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

/**
 * Checks the JSON shape of a deck store (`x` may be the parsed object or the raw JSON string).
 * Returns a detached copy, `'broken'` (not a store: the client moves it to `.bak`), or `'newer'`
 * (a newer build's format: shown read-only, never overwritten).
 * E1: first version (shape checks only); E4 pins it with tests.
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
  const decks: StoredDeck[] = data.decks.map((d) => ({
    id: d.id,
    side: d.side,
    name: d.name,
    identity: d.identity,
    cards: { ...d.cards },
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }));
  return { format: DECK_STORE_FORMAT, decks };
}

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isTime = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const isCounts = (x: unknown): x is Record<string, number> =>
  isObj(x) && Object.values(x).every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0);
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
