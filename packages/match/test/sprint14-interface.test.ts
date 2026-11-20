// Sprint 14 E1: first pins of the format-2 deck store, the merge rule and the upload check.
// E2 adds the property tests over random stores (sprint14-merge.test.ts).
import { describe, expect, it } from 'vitest';
import {
  DECK_STORE_FORMAT,
  MAX_DECK_CARD_ENTRIES,
  MAX_DECK_ID_LENGTH,
  MAX_DECK_NAME_LENGTH,
  MAX_DECK_UPLOAD_BYTES,
  MAX_STORE_DECKS,
  MAX_STORE_TOMBSTONES,
  checkDeckUpload,
  mergeDeckStores,
  parseDeckStore,
  type DeckStore,
  type StoredDeck,
} from '../src/index';

const T = 1_763_600_000_000;
const deck = (id: string, updatedAt: number, name = id, createdAt = T): StoredDeck => ({ id, side: 'corp', name, identity: 'c13', cards: { c01: 3 }, createdAt, updatedAt });
const store = (decks: StoredDeck[], deleted: { id: string; deletedAt: number }[] = []): DeckStore => ({ format: 2, decks, deleted });

describe('S-14 E1: deck store format 2', () => {
  it('format 2 with tombstones round-trips; format 1 reads as format 2', () => {
    const s = store([deck('a', T)], [{ id: 'b', deletedAt: T + 1 }]);
    expect(DECK_STORE_FORMAT).toBe(2);
    expect(parseDeckStore(JSON.stringify(s))).toEqual(s);
    expect(parseDeckStore({ format: 1, decks: [deck('a', T)], deleted: [{ id: 'x', deletedAt: 1 }] })).toEqual(store([deck('a', T)]));
  });

  it('format 2 needs a valid `deleted`; format 3 is newer', () => {
    expect(parseDeckStore({ format: 2, decks: [] })).toBe('broken');
    expect(parseDeckStore({ format: 2, decks: [], deleted: [{ id: '', deletedAt: 1 }] })).toBe('broken');
    expect(parseDeckStore({ format: 2, decks: [], deleted: [{ id: 'a', deletedAt: -1 }] })).toBe('broken');
    expect(parseDeckStore({ format: 3 })).toBe('newer');
  });

  it('a deck and a tombstone with one id: newest wins, tie → tombstone', () => {
    expect(parseDeckStore(store([deck('a', T + 5)], [{ id: 'a', deletedAt: T }]))).toEqual(store([deck('a', T + 5)]));
    expect(parseDeckStore(store([deck('a', T)], [{ id: 'a', deletedAt: T }]))).toEqual(store([], [{ id: 'a', deletedAt: T }]));
  });
});

describe('S-14 E1: mergeDeckStores', () => {
  it('a stale copy cannot revive a deleted deck; an edit after the delete does', () => {
    const deleted = store([], [{ id: 'a', deletedAt: T + 10 }]);
    expect(mergeDeckStores(store([deck('a', T)]), deleted)).toEqual(deleted);
    expect(mergeDeckStores(store([deck('a', T + 11)]), deleted)).toEqual(store([deck('a', T + 11)]));
  });

  it('newest edit wins; both devices\' other decks are kept; commutative and idempotent', () => {
    const a = store([deck('x', T + 1, 'phone'), deck('p', T, 'p', T - 5)]);
    const b = store([deck('x', T + 2, 'web'), deck('w', T, 'w', T + 5)]);
    const m = mergeDeckStores(a, b);
    expect(m.decks.map((d) => `${d.id}:${d.name}`)).toEqual(['p:p', 'x:web', 'w:w']);
    expect(mergeDeckStores(b, a)).toEqual(m);
    expect(mergeDeckStores(m, m)).toEqual(m);
    expect(mergeDeckStores(mergeDeckStores(a, b), m)).toEqual(m);
  });

  it('equal times between two decks: the smaller canonical JSON wins either way round', () => {
    const a = store([deck('x', T, 'Alpha')]);
    const b = store([deck('x', T, 'Beta')]);
    expect(mergeDeckStores(a, b)).toEqual(mergeDeckStores(b, a));
    expect(mergeDeckStores(a, b).decks[0]!.name).toBe('Alpha');
  });
});

describe('S-14 E1: checkDeckUpload', () => {
  it('accepts a normal store; refuses broken / newer', () => {
    const s = store([deck('a', T)]);
    expect(checkDeckUpload(s)).toEqual(s);
    expect(checkDeckUpload(JSON.stringify(s))).toEqual(s);
    expect(checkDeckUpload({ format: 2, decks: 'no' })).toBe('broken');
    expect(checkDeckUpload({ format: 9 })).toBe('newer');
    expect(checkDeckUpload(undefined)).toBe('broken');
  });

  it('limits: too many decks / too many bytes → too_big; long id / name / too many entries → broken', () => {
    expect(checkDeckUpload(store(Array.from({ length: MAX_STORE_DECKS + 1 }, (_, i) => deck(`d${i}`, T))))).toBe('too_big');
    expect(checkDeckUpload(store(Array.from({ length: MAX_STORE_DECKS }, (_, i) => deck(`d${i}`, T))))).not.toBe('too_big');
    expect(checkDeckUpload(store([deck('a', T, 'x'.repeat(MAX_DECK_UPLOAD_BYTES))]))).toBe('too_big');
    expect(checkDeckUpload(store([deck('a'.repeat(MAX_DECK_ID_LENGTH + 1), T)]))).toBe('broken');
    expect(checkDeckUpload(store([deck('a', T, 'n'.repeat(MAX_DECK_NAME_LENGTH + 1))]))).toBe('broken');
    expect(checkDeckUpload(store([], [{ id: 'a'.repeat(MAX_DECK_ID_LENGTH + 1), deletedAt: T }]))).toBe('broken');
    const many: Record<string, number> = {};
    for (let i = 0; i <= MAX_DECK_CARD_ENTRIES; i++) many[`z${i}`] = 1;
    expect(checkDeckUpload(store([{ ...deck('a', T), cards: many }]))).toBe('broken');
  });

  it('unknown ids and 4 copies are kept; tombstones over the cap keep the newest', () => {
    const odd = { ...deck('a', T), cards: { zz9: 4 } };
    expect(checkDeckUpload(store([odd]))).toEqual(store([odd]));
    const tombs = Array.from({ length: MAX_STORE_TOMBSTONES + 3 }, (_, i) => ({ id: `t${i}`, deletedAt: T + i }));
    const r = checkDeckUpload(store([], tombs));
    if (typeof r === 'string') throw new Error(r);
    expect(r.deleted).toHaveLength(MAX_STORE_TOMBSTONES);
    expect(r.deleted.some((t) => t.id === 't0' || t.id === 't1' || t.id === 't2')).toBe(false);
  });
});
