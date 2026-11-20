// QA Sprint 14 (independent, written by QA; not the developers' tests). The deck service through
// its real HTTP handler (decks.ts) over in-memory lockers/guards (deck-fakes.ts), the way two of
// the owner's devices would use it:
// - S-14-1 AC4: damaged / far-too-big uploads are refused and nothing already saved is lost;
// - S-14-2 AC4: both devices edit while one is offline: newest change per deck wins, changes to
//   different decks are all kept, in either upload order; a stale copy never revives a deleted deck;
// - S-14-2 AC6: wrong codes → no_decks; after 5 in a row the caller must wait (even the right code),
//   another device is not affected, the wait ends and the right code then works;
// - error replies never carry anyone's decks.
import { DECKS_NEW_PATH, DECKS_SYNC_PATH, MAX_DECK_UPLOAD_BYTES, parseDeckReply } from '@overclock/protocol';
import type { DeckStore, StoredDeck } from '@overclock/match';
import { describe, expect, it } from 'vitest';
import { DeckWorld, T, deck } from './deck-fakes';

const store = (decks: StoredDeck[], deleted: { id: string; deletedAt: number }[] = []): DeckStore => ({ format: 2, decks, deleted });
const byId = (s: DeckStore) => Object.fromEntries(s.decks.map((d) => [d.id, d]));

async function raw(w: DeckWorld, path: string, body: unknown, ip = 'qa'): Promise<{ status: number; text: string }> {
  const r = await w.post(path, body, { ip });
  return { status: r.status, text: await r.text() };
}

describe('QA S-14-1 AC4: a refused upload changes nothing already saved', () => {
  const damaged: [string, unknown][] = [
    ['not JSON at all', 'this is not json {'],
    ['store is a string', { v: 1, code: '', store: 'decks' }],
    ['decks not a list', { v: 1, store: { format: 2, decks: { a: 1 }, deleted: [] } }],
    ['unknown future format', { v: 1, store: { format: 99, decks: [], deleted: [] } }],
    ['negative copies', { v: 1, store: store([deck('x', { cards: { c01: -3 } })]) }],
    ['fractional copies', { v: 1, store: store([deck('x', { cards: { c01: 1.5 } })]) }],
    ['deck missing its side', { v: 1, store: { format: 2, decks: [{ ...deck('x'), side: undefined }], deleted: [] } }],
    ['name far too long', { v: 1, store: store([deck('x', { name: 'N'.repeat(5000) })]) }],
    ['tombstone with no time', { v: 1, store: { format: 2, decks: [], deleted: [{ id: 'x' }] } }],
  ];
  for (const [name, body] of damaged) {
    it(`damaged (${name}) → 400, locker unchanged`, async () => {
      const w = new DeckWorld();
      const saved = store([deck('keep', { name: 'Keep me' })]);
      const { code } = await w.newCode(saved, 'owner');
      const before = new Map(w.lockers.get(code)!.data);
      const b = typeof body === 'string' ? body : { ...(body as object), code };
      const r = await raw(w, DECKS_SYNC_PATH, b, 'owner');
      expect(r.status, r.text).toBe(400);
      expect(JSON.parse(r.text).error).toMatch(/^(bad_store|version)$/);
      expect(r.text).not.toContain('Keep me');
      expect(w.lockers.get(code)!.data).toEqual(before);
      // The saved deck is still there for the next good sync.
      const after = await w.sync(code, store([]), 'owner');
      expect(after.store.decks.map((d) => d.name)).toEqual(['Keep me']);
    });
  }

  it('far too big (300 KiB of names, and 201 decks) → 413 too_big, locker unchanged', async () => {
    const w = new DeckWorld();
    const { code } = await w.newCode(store([deck('keep', { name: 'Keep me' })]), 'owner');
    const before = new Map(w.lockers.get(code)!.data);
    const huge = store(Array.from({ length: 200 }, (_, i) => deck(`h${i}`, { name: 'x'.repeat(80), cards: Object.fromEntries(Array.from({ length: 90 }, (_, j) => [`c${String(j).padStart(2, '0')}-${'q'.repeat(30)}`, 1])) })));
    expect(JSON.stringify(huge).length).toBeGreaterThan(MAX_DECK_UPLOAD_BYTES);
    const r1 = await raw(w, DECKS_SYNC_PATH, { v: 1, code, store: huge }, 'owner');
    expect(r1.status).toBe(413);
    const many = store(Array.from({ length: 201 }, (_, i) => deck(`m${i}`)));
    const r2 = await raw(w, DECKS_SYNC_PATH, { v: 1, code, store: many }, 'owner');
    expect(r2.status).toBe(413);
    expect(JSON.parse(r2.text).error).toBe('too_big');
    expect(w.lockers.get(code)!.data).toEqual(before);
    // A refused `new` makes no locker at all.
    const n = w.lockerCount;
    expect((await raw(w, DECKS_NEW_PATH, { v: 1, store: many }, 'owner')).status).toBe(413);
    expect(w.lockerCount).toBe(n);
  });
});

describe('QA S-14-2 AC4: two devices, one offline — the most recent change per deck wins, other decks all kept', () => {
  for (const order of ['phone first', 'browser first'] as const) {
    it(`same deck changed on both, different decks changed on each (${order})`, async () => {
      const w = new DeckWorld();
      const base = store([deck('shared', { name: 'Shared v0' }), deck('p', { name: 'P v0' }), deck('b', { name: 'B v0' })]);
      const { code } = await w.newCode(base, 'browser');
      // Both devices hold `base`. The phone goes offline and edits `shared` (older) and `p`;
      // the browser edits `shared` later and `b`, and adds a new deck.
      const phone = store([deck('shared', { name: 'Shared phone', updatedAt: T + 1000 }), deck('p', { name: 'P phone', updatedAt: T + 500 }), deck('b', { name: 'B v0' })]);
      const browser = store([
        deck('shared', { name: 'Shared browser', updatedAt: T + 2000 }),
        deck('p', { name: 'P v0' }),
        deck('b', { name: 'B browser', updatedAt: T + 300 }),
        deck('new', { name: 'New on browser', createdAt: T + 400, updatedAt: T + 400 }),
      ]);
      const uploads = order === 'phone first' ? [['phone', phone], ['browser', browser]] as const : [['browser', browser], ['phone', phone]] as const;
      for (const [ip, s] of uploads) await w.sync(code, s, ip);
      // Both devices sync again (as the next Decks open would): both end with the same decks.
      const a = (await w.sync(code, phone, 'phone')).store;
      const b = (await w.sync(code, browser, 'browser')).store;
      expect(a).toEqual(b);
      const got = byId(a);
      expect(Object.keys(got).sort()).toEqual(['b', 'new', 'p', 'shared']);
      expect(got.shared!.name).toBe('Shared browser');
      expect(got.p!.name).toBe('P phone');
      expect(got.b!.name).toBe('B browser');
      expect(got.new!.name).toBe('New on browser');
    });
  }

  it('a delete on one device stays deleted when the other (offline, older copy) comes back; an edit made after the delete brings it back', async () => {
    const w = new DeckWorld();
    const { code } = await w.newCode(store([deck('x', { name: 'X', updatedAt: T + 10 }), deck('y', { name: 'Y' })]), 'browser');
    // Browser deletes X at T+100.
    await w.sync(code, store([deck('y', { name: 'Y' })], [{ id: 'x', deletedAt: T + 100 }]), 'browser');
    // Phone was offline with X edited at T+50 (before the delete): X stays deleted.
    const r1 = (await w.sync(code, store([deck('x', { name: 'X phone', updatedAt: T + 50 }), deck('y', { name: 'Y' })]), 'phone')).store;
    expect(r1.decks.map((d) => d.id)).toEqual(['y']);
    expect(r1.deleted.map((t) => t.id)).toEqual(['x']);
    // Phone edits X at T+200 (after the delete): the most recent change wins, X is back.
    const r2 = (await w.sync(code, store([deck('x', { name: 'X later', updatedAt: T + 200 }), deck('y', { name: 'Y' })]), 'phone')).store;
    expect(byId(r2).x?.name).toBe('X later');
  });

  it('linking keeps both devices\' decks (owner Q2 A), also two decks with the same name', async () => {
    const w = new DeckWorld();
    const { code } = await w.newCode(store([deck('a1', { name: 'My Corp deck 1' })]), 'browser');
    const linked = (await w.sync(code, store([deck('p1', { name: 'My Corp deck 1' })]), 'phone')).store;
    expect(linked.decks.map((d) => [d.id, d.name]).sort()).toEqual([
      ['a1', 'My Corp deck 1'],
      ['p1', 'My Corp deck 1'],
    ]);
  });
});

describe('QA S-14-2 AC6: wrong codes and the wait', () => {
  it('5 free wrong codes, then a wait; the right code waits too; another device is fine; after the wait the right code works and resets the count', async () => {
    const w = new DeckWorld();
    const { code } = await w.newCode(store([deck('secret', { name: 'Secret deck' })]), 'owner');
    const wrong = code.slice(0, 11) + (code[11] === 'A' ? 'B' : 'A');
    for (let i = 0; i < 5; i++) {
      const r = await raw(w, DECKS_SYNC_PATH, { v: 1, code: wrong, store: store([]) }, 'guesser');
      expect(r.status, `try ${i + 1}`).toBe(404);
      expect(JSON.parse(r.text).error).toBe('no_decks');
    }
    const locked = await raw(w, DECKS_SYNC_PATH, { v: 1, code: wrong, store: store([]) }, 'guesser');
    expect(locked.status).toBe(429);
    const reply = parseDeckReply(locked.status, locked.text);
    expect(reply.ok).toBe(false);
    if (!reply.ok) expect(reply.retryAfterMs).toBeGreaterThanOrEqual(60_000);
    // The right code from the waiting device learns nothing either.
    const rightWhileLocked = await raw(w, DECKS_SYNC_PATH, { v: 1, code, store: store([]) }, 'guesser');
    expect(rightWhileLocked.status).toBe(429);
    expect(rightWhileLocked.text).not.toContain('Secret deck');
    // Another device (IP) is not affected.
    expect((await w.sync(code, store([]), 'owner')).store.decks).toHaveLength(1);
    // After the wait, the right code works and resets the count (5 more free wrong tries).
    w.clock.t += 61_000;
    expect((await w.sync(code, store([]), 'guesser')).store.decks[0]!.name).toBe('Secret deck');
    for (let i = 0; i < 5; i++) expect((await raw(w, DECKS_SYNC_PATH, { v: 1, code: wrong, store: store([]) }, 'guesser')).status).toBe(404);
    expect((await raw(w, DECKS_SYNC_PATH, { v: 1, code: wrong, store: store([]) }, 'guesser')).status).toBe(429);
  });

  it('the wait grows with repeated lockouts (60 s, then longer), capped at an hour', async () => {
    const w = new DeckWorld();
    await w.newCode(store([deck('s')]), 'owner');
    const waits: number[] = [];
    for (let round = 0; round < 9; round++) {
      let r = await raw(w, DECKS_SYNC_PATH, { v: 1, code: 'KX4P9MTRQZ7D', store: store([]) }, 'g');
      while (r.status === 404) r = await raw(w, DECKS_SYNC_PATH, { v: 1, code: 'KX4P9MTRQZ7D', store: store([]) }, 'g');
      expect(r.status).toBe(429);
      const ms = JSON.parse(r.text).retryAfterMs as number;
      waits.push(ms);
      w.clock.t += ms + 1;
    }
    expect(waits[0]).toBeGreaterThanOrEqual(60_000);
    expect(waits[1]).toBeGreaterThan(waits[0]!);
    expect(Math.max(...waits)).toBeLessThanOrEqual(60 * 60_000);
  });
});
