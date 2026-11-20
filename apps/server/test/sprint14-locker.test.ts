// Sprint 14 E3 (S-14-1 AC4, S-14-2 AC2/4/5): the deck locker (pure) and the deck HTTP API —
// new/sync, two devices, linking keeps both, deletes travel, refused uploads change nothing,
// CORS preflight, origin allowlist, code clashes.
import {
  DECKS_NEW_PATH,
  DECKS_SYNC_PATH,
  MAX_DECK_UPLOAD_BYTES,
  MAX_STORE_DECKS,
  MAX_STORE_TOMBSTONES,
  TEST_IP_HEADER,
  formatDeckCode,
  isDeckCode,
  parseDeckReply,
} from '@overclock/protocol';
import { mergeDeckStores, type DeckStore } from '@overclock/match';
import { describe, expect, it } from 'vitest';
import { readCapped } from '../src/decks';
import { createLocker, readLocker, syncLocker } from '../src/locker';
import { DeckWorld, MemKv, ORIGIN, T, deck, ownStore } from './deck-fakes';

const empty: DeckStore = { format: 2, decks: [], deleted: [] };

describe('S-14 E3 locker (pure)', () => {
  it('no meta = no locker: sync is no_decks and writes nothing', () => {
    const kv = new MemKv();
    expect(syncLocker(kv, ownStore('a'))).toEqual({ ok: false, error: 'no_decks' });
    expect(readLocker(kv)).toBeNull();
    expect(kv.writes).toBe(0);
  });

  it('create stores per-deck keys; a second create is "taken" and changes nothing', () => {
    const kv = new MemKv();
    const s: DeckStore = { format: 2, decks: [deck('a'), deck('b')], deleted: [{ id: 'z', deletedAt: T }] };
    expect(createLocker(kv, s, T)).toEqual({ ok: true, store: s });
    expect([...kv.data.keys()].sort()).toEqual(['d:a', 'd:b', 'meta', 't:z']);
    const writes = kv.writes;
    expect(createLocker(kv, ownStore('q'), T)).toEqual({ ok: false, error: 'taken' });
    expect(kv.writes).toBe(writes);
    expect(readLocker(kv)).toEqual(s);
  });

  it('sync merges and writes only what changed; a delete replaces the deck key with a tombstone', () => {
    const kv = new MemKv();
    createLocker(kv, ownStore('a', 'b'), T);
    let w = kv.writes;
    expect(syncLocker(kv, ownStore('a', 'b'))).toEqual({ ok: true, store: ownStore('a', 'b') });
    expect(kv.writes).toBe(w);
    w = kv.writes;
    const res = syncLocker(kv, { format: 2, decks: [deck('a')], deleted: [{ id: 'b', deletedAt: T + 1 }] });
    expect(res).toEqual({ ok: true, store: { format: 2, decks: [deck('a')], deleted: [{ id: 'b', deletedAt: T + 1 }] } });
    expect(kv.writes - w).toBe(2); // delete d:b, put t:b
    expect(kv.data.has('d:b')).toBe(false);
    expect(kv.data.has('t:b')).toBe(true);
  });

  it('a merge that would exceed the deck limit is refused and changes nothing', () => {
    const kv = new MemKv();
    const half = (p: string, n: number): DeckStore => ({ format: 2, decks: Array.from({ length: n }, (_, i) => deck(`${p}${i}`)), deleted: [] });
    createLocker(kv, half('a', 150), T);
    const before = new Map(kv.data);
    expect(syncLocker(kv, half('b', 60))).toEqual({ ok: false, error: 'too_big' });
    expect(kv.data).toEqual(before);
    expect(syncLocker(kv, half('b', MAX_STORE_DECKS - 150)).ok).toBe(true);
  });

  it('a merge whose reply could not be sent back (bytes) is refused', () => {
    const kv = new MemKv();
    const big = (p: string): DeckStore => ({ format: 2, decks: Array.from({ length: 90 }, (_, i) => deck(`${p}${i}`, { name: 'n'.repeat(80), cards: Object.fromEntries(Array.from({ length: 20 }, (_, k) => [`card-${k}-${'x'.repeat(60)}`, 3])) })), deleted: [] });
    expect(JSON.stringify(big('a')).length).toBeLessThan(MAX_DECK_UPLOAD_BYTES);
    expect(JSON.stringify(mergeDeckStores(big('a'), big('b'))).length).toBeGreaterThan(MAX_DECK_UPLOAD_BYTES);
    createLocker(kv, big('a'), T);
    const before = new Map(kv.data);
    expect(syncLocker(kv, big('b'))).toEqual({ ok: false, error: 'too_big' });
    expect(kv.data).toEqual(before);
  });

  it('tombstones beyond the cap: the oldest are dropped from storage', () => {
    const kv = new MemKv();
    const tombs = (from: number) => Array.from({ length: 300 }, (_, i) => ({ id: `t${from + i}`, deletedAt: T + from + i }));
    createLocker(kv, { format: 2, decks: [], deleted: tombs(0) }, T);
    const res = syncLocker(kv, { format: 2, decks: [], deleted: tombs(300) });
    if (!res.ok) throw new Error(res.error);
    expect(res.store.deleted).toHaveLength(MAX_STORE_TOMBSTONES);
    expect(kv.list('t:')).toHaveLength(MAX_STORE_TOMBSTONES);
    expect(kv.data.has('t:t0')).toBe(false);
    expect(kv.data.has('t:t599')).toBe(true);
  });
});

describe('S-14 E3 deck HTTP API', () => {
  it('new mints a 12-letter code (shown in 3 groups) and stores the decks; sync answers the merged store', async () => {
    const w = new DeckWorld();
    const { code, store } = await w.newCode(ownStore('a'));
    expect(isDeckCode(code)).toBe(true);
    expect(formatDeckCode(code)).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(code).not.toMatch(/[01OIL]/);
    expect(store).toEqual(ownStore('a'));
    const r = await w.post(DECKS_SYNC_PATH, { v: 1, code, store: ownStore('b') });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty('code'); // the code is never echoed on sync
    expect(parseDeckReply(200, body)).toEqual({ ok: true, store: ownStore('a', 'b') });
  });

  it('two devices: linking keeps both; edits, renames and deletes reach the other; wiped device gets all back', async () => {
    const w = new DeckWorld();
    let phone: DeckStore = ownStore('p1');
    let web: DeckStore = ownStore('w1');
    const { code, store } = await w.newCode(phone, 'phone');
    phone = mergeDeckStores(phone, store);
    // Link the web with the typed code (lower case, dashes): both keep everything (owner Q2 A).
    const typed = formatDeckCode(code).toLowerCase();
    const r = await w.post(DECKS_SYNC_PATH, { v: 1, code: typed, store: web }, { ip: 'web' });
    const linked = parseDeckReply(r.status, await r.text());
    if (!linked.ok) throw new Error(linked.error);
    web = mergeDeckStores(web, linked.store);
    expect(web.decks.map((d) => d.id).sort()).toEqual(['p1', 'w1']);
    phone = mergeDeckStores(phone, (await w.sync(code, phone, 'phone')).store);
    expect(phone).toEqual(web);
    // Web renames p1 and deletes w1; phone edits nothing but syncs a stale copy afterwards.
    web = {
      format: 2,
      decks: web.decks.filter((d) => d.id !== 'w1').map((d) => (d.id === 'p1' ? { ...d, name: 'Renamed', updatedAt: T + 50 } : d)),
      deleted: [{ id: 'w1', deletedAt: T + 60 }],
    };
    web = mergeDeckStores(web, (await w.sync(code, web, 'web')).store);
    phone = mergeDeckStores(phone, (await w.sync(code, phone, 'phone')).store);
    expect(phone.decks.map((d) => `${d.id}:${d.name}`)).toEqual(['p1:Renamed']);
    expect(phone.deleted).toEqual([{ id: 'w1', deletedAt: T + 60 }]);
    // A wiped device (empty store) types the code: everything comes back.
    const wiped = (await w.sync(code, empty, 'new-phone')).store;
    expect(wiped).toEqual(phone);
  });

  it('refused uploads (garbage, broken, newer, wrong version, too big) change nothing stored', async () => {
    const w = new DeckWorld();
    const { code } = await w.newCode(ownStore('a'));
    const kv = w.lockers.get(code)!;
    const before = new Map(kv.data);
    const cases: [unknown, number, string][] = [
      ['not json', 400, 'bad_store'],
      [[1, 2], 400, 'bad_store'],
      [{ v: 1, code, store: { format: 2, decks: [{ id: 'x' }], deleted: [] } }, 400, 'bad_store'],
      [{ v: 1, code, store: { format: 7, decks: [], deleted: [] } }, 400, 'bad_store'],
      [{ v: 1, code }, 400, 'bad_store'],
      [{ v: 2, code, store: ownStore('b') }, 400, 'version'],
      [{ v: 1, code: 42, store: ownStore('b') }, 400, 'bad_store'],
      [{ v: 1, code, store: { format: 2, decks: Array.from({ length: MAX_STORE_DECKS + 1 }, (_, i) => deck(`d${i}`)), deleted: [] } }, 413, 'too_big'],
      [`{"v":1,"code":"${code}","store":{"format":2,"decks":[],"deleted":[]},"pad":"${'x'.repeat(MAX_DECK_UPLOAD_BYTES)}"}`, 413, 'too_big'],
    ];
    for (const [body, status, error] of cases) {
      const r = await w.post(DECKS_SYNC_PATH, body);
      expect([status, parseDeckReply(r.status, await r.text())]).toEqual([status, { ok: false, error }]);
      expect(r.status).toBe(status);
    }
    expect(kv.data).toEqual(before);
    // Same for `new`: nothing is created.
    const lockers = w.lockerCount;
    for (const body of ['{', { v: 1, store: { format: 2 } }, { v: 9, store: ownStore('a') }]) expect((await w.post(DECKS_NEW_PATH, body)).status).toBe(400);
    expect(w.lockerCount).toBe(lockers);
  });

  it('a declared Content-Length over the limit is refused before reading', async () => {
    const w = new DeckWorld();
    const r = await w.post(DECKS_NEW_PATH, { v: 1, store: ownStore('a') }, { headers: { 'Content-Length': String(MAX_DECK_UPLOAD_BYTES + 1) } });
    expect(r.status).toBe(413);
    expect(w.lockerCount).toBe(0);
  });

  it('a streamed body with no Content-Length is cut off once it passes the limit (never held whole)', async () => {
    let pulled = 0;
    const chunk = new Uint8Array(64 * 1024).fill(0x20);
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++;
        if (pulled > 1000) c.close();
        else c.enqueue(chunk);
      },
    });
    const req = new Request(`${ORIGIN}/x`, { method: 'POST', body, duplex: 'half' } as RequestInit);
    expect(await readCapped(req, MAX_DECK_UPLOAD_BYTES)).toBe('too_big');
    expect(pulled).toBeLessThan(10);
    expect(await readCapped(new Request(`${ORIGIN}/x`, { method: 'POST', body: '{"a":"é"}' }), MAX_DECK_UPLOAD_BYTES)).toBe('{"a":"é"}');
    expect(await readCapped(new Request(`${ORIGIN}/x`, { method: 'POST', body: new Uint8Array([0xff, 0xfe]) }), MAX_DECK_UPLOAD_BYTES)).toBeNull();
  });

  it('CORS: allowed origins get a preflight and ACAO on every reply; others and no-origin get 403', async () => {
    const w = new DeckWorld();
    const pre = await w.post(DECKS_SYNC_PATH, null, { method: 'OPTIONS' });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(pre.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(pre.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
    expect(pre.headers.get('Access-Control-Allow-Headers')).toContain(TEST_IP_HEADER);
    expect(pre.headers.get('Vary')).toBe('Origin');
    const app = await w.post(DECKS_NEW_PATH, null, { method: 'OPTIONS', origin: 'https://localhost' });
    expect(app.headers.get('Access-Control-Allow-Origin')).toBe('https://localhost');
    expect((await w.post(DECKS_SYNC_PATH, null, { method: 'OPTIONS', origin: 'https://evil.example' })).status).toBe(403);
    expect((await w.post(DECKS_NEW_PATH, { v: 1, store: ownStore('a') }, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await w.post(DECKS_NEW_PATH, { v: 1, store: ownStore('a') }, { origin: null })).status).toBe(403);
    expect(w.lockerCount).toBe(0);
    const ok = await w.post(DECKS_NEW_PATH, { v: 1, store: ownStore('a') });
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(ok.headers.get('Cache-Control')).toBe('no-store');
    const bad = await w.post(DECKS_NEW_PATH, '{');
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect((await w.post(DECKS_SYNC_PATH, null, { method: 'GET' })).status).toBe(405);
  });

  it('outside test mode the preflight does not offer the test IP header', async () => {
    const w = new DeckWorld({ testMode: false });
    const pre = await w.post(DECKS_SYNC_PATH, null, { method: 'OPTIONS' });
    expect(pre.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
  });

  it('a taken code is skipped: new mints another', async () => {
    const w = new DeckWorld({ codes: ['KX4P9MTRQZ7D', 'KX4P9MTRQZ7D', 'ABCDEFGHJKMN'] });
    expect((await w.newCode(ownStore('a'))).code).toBe('KX4P9MTRQZ7D');
    expect((await w.newCode(ownStore('b'))).code).toBe('ABCDEFGHJKMN');
    expect((await w.sync('KX4P9MTRQZ7D', empty)).store).toEqual(ownStore('a'));
  });

  it('a locker is created only by `new` — an unknown code never makes an empty locker', async () => {
    const w = new DeckWorld();
    await w.post(DECKS_SYNC_PATH, { v: 1, code: 'ABCDEFGHJKMN', store: ownStore('a') });
    expect(w.lockerCount).toBe(0);
    expect([...w.lockers.values()].every((kv) => kv.data.size === 0)).toBe(true);
  });
});
