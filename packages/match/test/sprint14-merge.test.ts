// Sprint 14 E2 (S-14-1 AC4, S-14-2 AC4): the one deck-store merge rule and the upload check.
// Property tests over seeded random stores (no extra dependency): merge is commutative,
// associative and idempotent; a stale copy can't revive a deleted deck; an edit made after
// the delete does; devices that sync in any order converge on "the most recent change wins".
import { describe, expect, it } from 'vitest';
import {
  MAX_DECK_UPLOAD_BYTES,
  MAX_STORE_DECKS,
  MAX_STORE_TOMBSTONES,
  checkDeckUpload,
  mergeDeckStores,
  parseDeckStore,
  type DeckStore,
  type DeckTombstone,
  type StoredDeck,
} from '../src/index';

/** Test-only seeded RNG (mulberry32), so every run sees the same random stores. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const T = 1_763_600_000_000;
const IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const NAMES = ['Alpha', 'Beta', 'Gamma', 'My Corp deck 1', 'Ünïcode ✓'];
const CARDS = ['c01', 'c02', 'c03', 'r01', 'r02', 'zz9'];

function randomDeck(r: () => number, id: string): StoredDeck {
  const pick = <X>(xs: readonly X[]): X => xs[Math.floor(r() * xs.length)]!;
  const cards: Record<string, number> = {};
  const n = Math.floor(r() * 4);
  for (let i = 0; i < n; i++) cards[pick(CARDS)] = 1 + Math.floor(r() * 4);
  const createdAt = T + Math.floor(r() * 5);
  // Small time range so ties (deck vs deck, deck vs tombstone) happen often.
  return { id, side: r() < 0.5 ? 'corp' : 'runner', name: pick(NAMES), identity: pick(['c13', 'r13']), cards, createdAt, updatedAt: createdAt + Math.floor(r() * 4) };
}

/** A random raw store (may hold duplicate ids and deck/tombstone clashes), parsed like a real upload. */
function randomStore(r: () => number): DeckStore {
  const decks: StoredDeck[] = [];
  const deleted: DeckTombstone[] = [];
  const n = Math.floor(r() * 7);
  for (let i = 0; i < n; i++) {
    const id = IDS[Math.floor(r() * IDS.length)]!;
    if (r() < 0.3) deleted.push({ id, deletedAt: T + Math.floor(r() * 9) });
    else decks.push(randomDeck(r, id));
  }
  const parsed = parseDeckStore(JSON.parse(JSON.stringify({ format: 2, decks, deleted })));
  if (typeof parsed === 'string') throw new Error(parsed);
  return parsed;
}

const RUNS = 400;

describe('S-14 E2: merge properties over random stores', () => {
  it(`commutative, associative, idempotent (${RUNS} seeded triples)`, () => {
    const r = rng(14);
    for (let i = 0; i < RUNS; i++) {
      const [a, b, c] = [randomStore(r), randomStore(r), randomStore(r)];
      const ab = mergeDeckStores(a, b);
      expect(mergeDeckStores(b, a)).toEqual(ab);
      expect(mergeDeckStores(mergeDeckStores(a, b), c)).toEqual(mergeDeckStores(a, mergeDeckStores(b, c)));
      expect(mergeDeckStores(ab, ab)).toEqual(ab);
      expect(mergeDeckStores(ab, a)).toEqual(ab); // merging an input in again changes nothing
      expect(mergeDeckStores(a, a)).toEqual(mergeDeckStores(a, { format: 2, decks: [], deleted: [] }));
    }
  });

  it('per id the result is the newest change; each id once; output canonical and a parse fixed point', () => {
    const r = rng(1414);
    for (let i = 0; i < RUNS; i++) {
      const a = randomStore(r);
      const b = randomStore(r);
      const m = mergeDeckStores(a, b);
      const ids = [...m.decks.map((d) => d.id), ...m.deleted.map((t) => t.id)];
      expect(new Set(ids).size).toBe(ids.length);
      const inputIds = new Set([...a.decks, ...a.deleted, ...b.decks, ...b.deleted].map((x) => x.id));
      expect(new Set(ids)).toEqual(inputIds); // nothing is lost, nothing invented
      for (const id of inputIds) {
        const times = [
          ...[...a.decks, ...b.decks].filter((d) => d.id === id).map((d) => d.updatedAt),
          ...[...a.deleted, ...b.deleted].filter((t) => t.id === id).map((t) => t.deletedAt),
        ];
        const newest = Math.max(...times);
        const tomb = m.deleted.find((t) => t.id === id);
        const kept = m.decks.find((d) => d.id === id);
        expect(tomb ? tomb.deletedAt : kept!.updatedAt).toBe(newest);
        // A tombstone at the newest time always wins over a deck at that time.
        const tombAtNewest = [...a.deleted, ...b.deleted].some((t) => t.id === id && t.deletedAt === newest);
        expect(Boolean(tomb)).toBe(tombAtNewest);
      }
      const sorted = [...m.decks].sort((x, y) => x.createdAt - y.createdAt || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
      expect(m.decks).toEqual(sorted);
      expect(m.deleted.map((t) => t.id)).toEqual([...m.deleted.map((t) => t.id)].sort());
      expect(parseDeckStore(JSON.stringify(m))).toEqual(m);
      expect(checkDeckUpload(m)).toEqual(m);
    }
  });

  it('the result is detached from its inputs', () => {
    const a: DeckStore = { format: 2, decks: [{ id: 'a', side: 'corp', name: 'A', identity: 'c13', cards: { c01: 3 }, createdAt: T, updatedAt: T }], deleted: [] };
    const m = mergeDeckStores(a, { format: 2, decks: [], deleted: [] });
    (m.decks[0]!.cards as Record<string, number>).c01 = 1;
    expect(a.decks[0]!.cards.c01).toBe(3);
  });
});

describe('S-14 E2: deletes and later edits (two devices)', () => {
  const deckAt = (updatedAt: number, name = 'X'): StoredDeck => ({ id: 'x', side: 'runner', name, identity: 'r13', cards: { r01: 3 }, createdAt: T, updatedAt });
  const s = (decks: StoredDeck[], deleted: DeckTombstone[] = []): DeckStore => ({ format: 2, decks, deleted });

  it('a stale copy (edited before the delete, or at the same ms) never revives the deck, in either order', () => {
    const del = s([], [{ id: 'x', deletedAt: T + 10 }]);
    for (const t of [T, T + 9, T + 10]) {
      expect(mergeDeckStores(s([deckAt(t)]), del)).toEqual(del);
      expect(mergeDeckStores(del, s([deckAt(t)]))).toEqual(del);
    }
  });

  it('an edit made after the delete brings the deck back (the most recent change wins)', () => {
    const del = s([], [{ id: 'x', deletedAt: T + 10 }]);
    expect(mergeDeckStores(del, s([deckAt(T + 11, 'Edited')]))).toEqual(s([deckAt(T + 11, 'Edited')]));
  });

  it('the newest of two edits wins; changes to different decks are all kept', () => {
    const phone = s([deckAt(T + 5, 'phone'), { ...deckAt(T, 'P'), id: 'p' }]);
    const web = s([deckAt(T + 7, 'web'), { ...deckAt(T, 'W'), id: 'w' }]);
    const m = mergeDeckStores(phone, web);
    expect(m.decks.map((d) => `${d.id}:${d.name}`).sort()).toEqual(['p:P', 'w:W', 'x:web']);
  });

  it(`simulated devices + server, random edits/deletes/syncs in any order, converge on the newest change (${RUNS / 4} runs)`, () => {
    const r = rng(77);
    for (let run = 0; run < RUNS / 4; run++) {
      const devices: DeckStore[] = [0, 1, 2].map(() => ({ format: 2, decks: [], deleted: [] }));
      let server: DeckStore = { format: 2, decks: [], deleted: [] };
      let clock = T;
      /** The truth: per id the last change made anywhere (strictly increasing clock). */
      const last = new Map<string, StoredDeck | null>();
      for (let step = 0; step < 40; step++) {
        const k = Math.floor(r() * devices.length);
        const dev = devices[k]!;
        const roll = r();
        const id = IDS[Math.floor(r() * 4)]!;
        clock += 1;
        if (roll < 0.35) {
          const old = dev.decks.find((d) => d.id === id);
          const d: StoredDeck = { ...randomDeck(r, id), createdAt: old?.createdAt ?? clock, updatedAt: clock };
          devices[k] = { format: 2, decks: [...dev.decks.filter((x) => x.id !== id), d], deleted: dev.deleted.filter((t) => t.id !== id) };
          last.set(id, d);
        } else if (roll < 0.5) {
          if (!dev.decks.some((d) => d.id === id)) continue;
          devices[k] = { format: 2, decks: dev.decks.filter((x) => x.id !== id), deleted: [...dev.deleted.filter((t) => t.id !== id), { id, deletedAt: clock }] };
          last.set(id, null);
        } else {
          // Sync: upload whole store; the server merges and answers; the device merges the answer in.
          server = mergeDeckStores(server, dev);
          devices[k] = mergeDeckStores(dev, server);
        }
      }
      for (let k = 0; k < devices.length; k++) server = mergeDeckStores(server, devices[k]!);
      for (let k = 0; k < devices.length; k++) devices[k] = mergeDeckStores(devices[k]!, server);
      for (const dev of devices) expect(dev).toEqual(server);
      for (const [id, d] of last) {
        if (d === null) expect(server.deleted.some((t) => t.id === id) && !server.decks.some((x) => x.id === id)).toBe(true);
        else expect(server.decks.find((x) => x.id === id)).toEqual(d);
      }
    }
  });
});

describe('S-14 E2: upload check refuses damaged or oversized stores', () => {
  it('broken shapes → broken; newer format → newer; never throws on junk', () => {
    const junk: unknown[] = [
      null,
      42,
      'not json {',
      '[]',
      [],
      { format: 2 },
      { format: 2, decks: [{ id: 'a' }], deleted: [] },
      { format: 2, decks: [], deleted: 'x' },
      { format: 2, decks: [{ id: 'a', side: 'corp', name: 'A', identity: 'c13', cards: { c01: 1.5 }, createdAt: T, updatedAt: T }], deleted: [] },
      { format: 2, decks: [{ id: 'a', side: 'both', name: 'A', identity: 'c13', cards: {}, createdAt: T, updatedAt: T }], deleted: [] },
      { format: 2, decks: [{ id: 'a', side: 'corp', name: 'A', identity: 'c13', cards: {}, createdAt: T, updatedAt: Number.NaN }], deleted: [] },
      { format: 'two', decks: [], deleted: [] },
    ];
    for (const x of junk) expect(checkDeckUpload(x)).toBe('broken');
    expect(checkDeckUpload({ format: 3, decks: [], deleted: [] })).toBe('newer');
    const cyclic: Record<string, unknown> = { format: 2 };
    cyclic.self = cyclic;
    expect(checkDeckUpload(cyclic)).toBe('broken');
    expect(checkDeckUpload(BigInt(1))).toBe('broken');
  });

  it('random byte damage to a real store is either refused or still a valid store (never throws)', () => {
    const r = rng(9);
    const good = JSON.stringify(mergeDeckStores(randomStore(r), randomStore(r)));
    for (let i = 0; i < RUNS; i++) {
      const at = Math.floor(r() * good.length);
      const bad = good.slice(0, at) + String.fromCharCode(32 + Math.floor(r() * 90)) + good.slice(at + 1);
      const res = checkDeckUpload(bad);
      if (typeof res !== 'string') expect(parseDeckStore(JSON.stringify(res))).toEqual(res);
      else expect(['broken', 'newer', 'too_big']).toContain(res);
    }
  });

  it('far too big → too_big (bytes, multi-byte text, deck count); exactly at the limits is fine', () => {
    const deck = (i: number): StoredDeck => ({ id: `d${i}`, side: 'corp', name: 'N', identity: 'c13', cards: { c01: 3 }, createdAt: T, updatedAt: T });
    expect(checkDeckUpload({ format: 2, decks: Array.from({ length: MAX_STORE_DECKS + 1 }, (_, i) => deck(i)), deleted: [] })).toBe('too_big');
    expect(typeof checkDeckUpload({ format: 2, decks: Array.from({ length: MAX_STORE_DECKS }, (_, i) => deck(i)), deleted: [] })).toBe('object');
    // 3-byte characters: under the limit in UTF-16 units, over it in UTF-8 bytes.
    const wide = '✓'.repeat(Math.ceil(MAX_DECK_UPLOAD_BYTES / 3) + 10);
    expect(wide.length).toBeLessThan(MAX_DECK_UPLOAD_BYTES);
    expect(checkDeckUpload(`{"format":2,"decks":[],"deleted":[],"pad":"${wide}"}`)).toBe('too_big');
    expect(checkDeckUpload(' '.repeat(MAX_DECK_UPLOAD_BYTES + 1))).toBe('too_big');
  });

  it('tombstones beyond the cap: the oldest are dropped, decks untouched', () => {
    const tombs = Array.from({ length: MAX_STORE_TOMBSTONES * 2 }, (_, i) => ({ id: `t${i}`, deletedAt: T + (i % 600) }));
    const res = checkDeckUpload({ format: 2, decks: [], deleted: tombs });
    if (typeof res === 'string') throw new Error(res);
    expect(res.deleted).toHaveLength(MAX_STORE_TOMBSTONES);
    const minKept = Math.min(...res.deleted.map((t) => t.deletedAt));
    const dropped = tombs.filter((t) => !res.deleted.some((k) => k.id === t.id));
    expect(dropped.every((t) => t.deletedAt <= minKept)).toBe(true);
  });
});
