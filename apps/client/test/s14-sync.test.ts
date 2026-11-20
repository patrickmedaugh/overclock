// Sprint 14 (U1, U2, U3): the deck library's deletes and merges, the deck sync against a fake deck
// service and a fake clock (no network), the refusal words, and the online match's deck messages.
import { IDENTITIES, STANDARD_DECKS, countsOf } from '@overclock/cards';
import { type DeckStore, mergeDeckStores } from '@overclock/match';
import { DECKS_NEW_PATH, DECKS_SYNC_PATH, DECK_SYNC_STORAGE_KEY, PROTOCOL_VERSION, type ServerMsg, encodeMsg, formatDeckCode } from '@overclock/protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import { DECKS_KEY, DeckLibrary } from '../src/deckStore';
import { DeckSync, type HttpReply, SYNC_TIMING, deckServiceUrl, readDeckSync } from '../src/deckSync';
import { DECK_TEXT, ONLINE_DECK_TEXT, SYNC_TEXT, refusedText } from '../src/deckText';
import { type OnlineDeps, OnlineMatch, type OnlinePhase, type SocketLike } from '../src/online';
import { FAIL_TEXT } from '../src/startScreen';

class MemStore {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

class FakeClock {
  now = 1_000_000;
  private timers = new Map<number, { at: number; fn: () => void }>();
  private next = 1;
  setTimeout = (fn: () => void, ms: number): unknown => {
    const id = this.next++;
    this.timers.set(id, { at: this.now + ms, fn });
    return id;
  };
  clearTimeout = (id: unknown): void => {
    this.timers.delete(id as number);
  };
  /** Runs due timers, letting promises settle between them. */
  async advance(ms: number): Promise<void> {
    const end = this.now + ms;
    for (;;) {
      await settle();
      let first: [number, { at: number; fn: () => void }] | null = null;
      for (const e of this.timers) if (e[1].at <= end && (!first || e[1].at < first[1].at)) first = e;
      if (!first) break;
      this.timers.delete(first[0]);
      this.now = first[1].at;
      first[1].fn();
    }
    this.now = end;
    await settle();
  }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

/** A deck service in memory: lockers by code, the merge rule, wrong codes counted. */
class FakeService {
  lockers = new Map<string, DeckStore>();
  calls: { path: string; body: { v: number; code?: string; store: DeckStore } }[] = [];
  offline = false;
  wrong = 0;
  lockMs = 0;
  private n = 0;
  post = async (url: string, body: string): Promise<HttpReply> => {
    if (this.offline) throw new TypeError('Failed to fetch');
    const path = new URL(url).pathname;
    const b = JSON.parse(body) as { v: number; code?: string; store: DeckStore };
    this.calls.push({ path, body: b });
    const reply = (status: number, data: unknown): HttpReply => ({ status, text: async () => JSON.stringify(data) });
    if (path === DECKS_NEW_PATH) {
      const code = `ABCDEFGHJK${'MNPQRSTUVWXYZ'[this.n++]}2`;
      this.lockers.set(code, mergeDeckStores(b.store, b.store));
      return reply(200, { v: 1, code, store: this.lockers.get(code) });
    }
    if (this.lockMs > 0) return reply(429, { v: 1, error: 'wait', retryAfterMs: this.lockMs });
    const have = this.lockers.get(b.code ?? '');
    if (!have) {
      this.wrong++;
      return reply(404, { v: 1, error: 'no_decks' });
    }
    const merged = mergeDeckStores(have, b.store);
    this.lockers.set(b.code!, merged);
    return reply(200, { v: 1, store: merged });
  };
}

const NOW = 1_000_000;
function lib(storage: MemStore, clock: FakeClock, ids = 'd'): DeckLibrary {
  let n = 0;
  return new DeckLibrary(storage, { schedule: (fn) => (fn(), 1), now: () => clock.now, newId: () => `${ids}-${++n}` });
}

function makeSync(storage: MemStore, library: DeckLibrary, clock: FakeClock, service: FakeService, online = () => true): DeckSync {
  return new DeckSync({
    server: 'https://decks.test',
    storage,
    library,
    post: (url, body) => service.post(url, body),
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: () => clock.now,
    online,
  });
}

describe('DeckLibrary: deletes and the online copy (S-14-1, S-14-2)', () => {
  it('a delete leaves a tombstone newer than the deck, kept in the store', () => {
    const clock = new FakeClock();
    const s = new MemStore();
    const l = lib(s, clock);
    const d = l.create('corp', null);
    expect(l.hasOwn()).toBe(true);
    clock.now += 10;
    l.remove(d.id);
    expect(l.mine('corp')).toEqual([]);
    expect(l.hasOwn()).toBe(true);
    const stored = JSON.parse(s.getItem(DECKS_KEY)!) as DeckStore;
    expect(stored.format).toBe(2);
    expect(stored.deleted).toEqual([{ id: d.id, deletedAt: NOW + 10 }]);
    // and it reads back
    expect(lib(s, clock).snapshot().deleted).toEqual([{ id: d.id, deletedAt: NOW + 10 }]);
  });

  it('local changes are reported after the write; merged-in decks as remote (not local)', () => {
    const clock = new FakeClock();
    const l = lib(new MemStore(), clock);
    const seen: string[] = [];
    l.onChange((c) => seen.push(c));
    const d = l.create('runner', null);
    l.rename(d.id, 'Mine');
    expect(seen).toEqual(['local', 'local']);
    const other = lib(new MemStore(), clock, 'o');
    other.create('corp', countsOf(STANDARD_DECKS.corp));
    expect(l.applyRemote(other.snapshot())).toBe(true);
    expect(seen).toEqual(['local', 'local', 'remote']);
    // Merging the same again changes nothing and says nothing.
    expect(l.applyRemote(other.snapshot())).toBe(false);
    expect(seen.length).toBe(3);
    expect(l.mine('corp').map((x) => x.id)).toEqual(['o-1']);
  });

  it('the newest change wins: a remote delete removes the deck; a stale copy does not bring it back', () => {
    const clock = new FakeClock();
    const a = lib(new MemStore(), clock);
    const d = a.create('corp', null);
    const old = a.snapshot();
    clock.now += 100;
    const b = new DeckLibrary(new MemStore(), { schedule: (fn) => (fn(), 1), now: () => clock.now });
    b.applyRemote(old);
    b.remove(d.id);
    a.applyRemote(b.snapshot());
    expect(a.get(d.id)).toBeNull();
    a.applyRemote(old);
    expect(a.get(d.id)).toBeNull();
  });

  it('a Sprint 13 (format 1) store reads with no deletes; a newer build\'s store is read only and never merged', () => {
    const clock = new FakeClock();
    const s = new MemStore();
    const deck = { id: 'x', side: 'corp', name: 'Old', identity: IDENTITIES.corp, cards: {}, createdAt: 1, updatedAt: 1 };
    s.setItem(DECKS_KEY, JSON.stringify({ format: 1, decks: [deck] }));
    expect(lib(s, clock).snapshot()).toEqual({ format: 2, decks: [deck], deleted: [] });
    s.setItem(DECKS_KEY, JSON.stringify({ format: 3, decks: [deck] }));
    const ro = lib(s, clock);
    expect(ro.readOnly).toBe(true);
    expect(ro.mine('corp').map((d) => d.name)).toEqual(['Old']);
    expect(ro.applyRemote({ format: 2, decks: [], deleted: [{ id: 'x', deletedAt: 5 }] })).toBe(false);
  });
});

describe('DeckSync (S-14-1, S-14-2)', () => {
  let clock: FakeClock;
  let service: FakeService;
  beforeEach(() => {
    clock = new FakeClock();
    service = new FakeService();
  });

  it('a device with only the standard decks sends nothing, even when asked (AC5)', async () => {
    const s = new MemStore();
    const sync = makeSync(s, lib(s, clock), clock, service);
    expect(sync.status()).toBe('none');
    await sync.syncNow();
    await clock.advance(60_000);
    expect(service.calls).toEqual([]);
    expect(s.getItem(DECK_SYNC_STORAGE_KEY)).toBeNull();
  });

  it('the first own deck goes online 1.5 s after the write and gets a code; then "Saved online" (AC1)', async () => {
    const s = new MemStore();
    const l = lib(s, clock);
    const sync = makeSync(s, l, clock, service);
    const statuses: string[] = [];
    sync.onStatus((x) => statuses.push(x));
    l.create('corp', countsOf(STANDARD_DECKS.corp));
    expect(sync.status()).toBe('saving');
    await clock.advance(SYNC_TIMING.afterWrite - 1);
    expect(service.calls).toEqual([]);
    await clock.advance(1);
    expect(service.calls.map((c) => c.path)).toEqual([DECKS_NEW_PATH]);
    expect(sync.code).toMatch(/^[A-Z2-9]{12}$/);
    expect(sync.status()).toBe('saved');
    expect(statuses).toEqual(['saving', 'saved']);
    const kept = readDeckSync(s, 'https://decks.test', true);
    expect(kept).toMatchObject({ code: sync.code, rev: 1, syncedRev: 1 });
    // Later changes use the code.
    l.rename(l.mine('corp')[0]!.id, 'Renamed');
    await clock.advance(SYNC_TIMING.afterWrite);
    expect(service.calls.map((c) => c.path)).toEqual([DECKS_NEW_PATH, DECKS_SYNC_PATH]);
    expect(service.lockers.get(sync.code!)!.decks[0]!.name).toBe('Renamed');
  });

  it('offline: kept on the device, "pending"; back online it goes up by itself (AC2)', async () => {
    const s = new MemStore();
    const l = lib(s, clock);
    let online = true;
    const sync = makeSync(s, l, clock, service, () => online);
    l.create('runner', null);
    await clock.advance(SYNC_TIMING.afterWrite);
    expect(sync.status()).toBe('saved');
    online = false;
    service.offline = true;
    sync.networkChanged();
    l.rename(l.mine('runner')[0]!.id, 'Offline name');
    expect(sync.status()).toBe('pending');
    await clock.advance(SYNC_TIMING.afterWrite + 5000);
    expect(sync.status()).toBe('pending');
    expect(JSON.parse(s.getItem(DECKS_KEY)!).decks[0].name).toBe('Offline name');
    online = true;
    service.offline = false;
    sync.networkChanged();
    await clock.advance(0);
    expect(sync.status()).toBe('saved');
    expect(service.lockers.get(sync.code!)!.decks[0]!.name).toBe('Offline name');
  });

  it('failures retry after 5, 15 and 60 s', async () => {
    const s = new MemStore();
    const l = lib(s, clock);
    const sync = makeSync(s, l, clock, service);
    service.offline = true;
    l.create('runner', null);
    await clock.advance(SYNC_TIMING.afterWrite);
    expect(sync.status()).toBe('pending');
    service.offline = false;
    await clock.advance(4999);
    expect(service.calls.length).toBe(0);
    await clock.advance(1);
    expect(service.calls.length).toBe(1);
    expect(sync.status()).toBe('saved');
  });

  it('two devices linked with the code end up with the same decks (owner Q2 A: both kept)', async () => {
    const sa = new MemStore();
    const la = lib(sa, clock, 'a');
    const a = makeSync(sa, la, clock, service);
    la.create('corp', null);
    await clock.advance(SYNC_TIMING.afterWrite);
    const sb = new MemStore();
    const lb = lib(sb, clock, 'b');
    lb.create('runner', null);
    const b = makeSync(sb, lb, clock, service);
    expect(await b.link(formatDeckCode(a.code!).toLowerCase())).toEqual({ ok: true });
    expect(b.code).toBe(a.code);
    expect(lb.mine('corp').map((d) => d.id)).toEqual(['a-1']);
    expect(lb.mine('runner').map((d) => d.id)).toEqual(['b-1']);
    await a.syncNow();
    expect(la.mine('runner').map((d) => d.id)).toEqual(['b-1']);
    // a delete on b reaches a
    clock.now += 50;
    lb.remove('a-1');
    await clock.advance(SYNC_TIMING.afterWrite);
    await a.syncNow();
    expect(la.get('a-1')).toBeNull();
  });

  it('wiped data: the code brings every deck back', async () => {
    const sa = new MemStore();
    const la = lib(sa, clock);
    const a = makeSync(sa, la, clock, service);
    la.create('corp', null);
    la.create('runner', null);
    await clock.advance(SYNC_TIMING.afterWrite);
    const fresh = new MemStore();
    const lf = lib(fresh, clock);
    const f = makeSync(fresh, lf, clock, service);
    expect(await f.link(a.code!)).toEqual({ ok: true });
    expect(lf.snapshot().decks.length).toBe(2);
    expect(f.status()).toBe('saved');
  });

  it('a wrong code says so; a "wait" locks linking for that long, remembered across restarts (AC6)', async () => {
    const s = new MemStore();
    const l = lib(s, clock);
    const sync = makeSync(s, l, clock, service);
    expect(await sync.link('KX4P')).toEqual({ ok: false, reason: 'bad_code' });
    expect(await sync.link('KX4P-9MTR-QZ7D')).toEqual({ ok: false, reason: 'no_decks' });
    service.lockMs = 120_000;
    expect(await sync.link('KX4P-9MTR-QZ7D')).toEqual({ ok: false, reason: 'wait', waitMs: 120_000 });
    const calls = service.calls.length;
    const again = makeSync(s, l, clock, service);
    expect(again.lockUntil).toBe(clock.now + 120_000);
    const r = await again.link('KX4P-9MTR-QZ7D');
    expect(r).toEqual({ ok: false, reason: 'wait', waitMs: 120_000 });
    expect(service.calls.length).toBe(calls);
    expect(SYNC_TEXT.wait(120_000)).toBe('Too many wrong codes. Try again in 2 minutes.');
    expect(SYNC_TEXT.wait(30_000)).toBe('Too many wrong codes. Try again in 1 minute.');
  });

  it('My deck code with no decks asks for a new code (the player asked)', async () => {
    const s = new MemStore();
    const sync = makeSync(s, lib(s, clock), clock, service);
    const r = await sync.myCode();
    expect(r.ok && r.code).toMatch(/^[A-Z2-9]{12}$/);
    expect(service.calls.map((c) => c.path)).toEqual([DECKS_NEW_PATH]);
    expect(sync.status()).toBe('saved');
    // asked again: the same code, no request
    expect(await sync.myCode()).toEqual(r);
    expect(service.calls.length).toBe(1);
  });

  it('polls every 10 s while the Decks list is open', async () => {
    const s = new MemStore();
    const l = lib(s, clock);
    const sync = makeSync(s, l, clock, service);
    l.create('corp', null);
    await clock.advance(SYNC_TIMING.afterWrite);
    const n = service.calls.length;
    sync.setPolling(true);
    await clock.advance(SYNC_TIMING.poll * 3);
    expect(service.calls.length).toBe(n + 3);
    sync.setPolling(false);
    await clock.advance(SYNC_TIMING.poll * 3);
    expect(service.calls.length).toBe(n + 3);
  });

  it('no service in this build: nothing at all', async () => {
    const s = new MemStore();
    const l = lib(s, clock);
    const sync = new DeckSync({ server: '', storage: s, library: l, post: service.post, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, now: () => clock.now, online: () => true });
    l.create('corp', null);
    await clock.advance(60_000);
    expect(sync.enabled).toBe(false);
    expect(sync.status()).toBe('none');
    expect(service.calls).toEqual([]);
  });

  it('the deck service address comes from the game service address', () => {
    expect(deckServiceUrl('wss://overclock.example.workers.dev')).toBe('https://overclock.example.workers.dev');
    expect(deckServiceUrl('ws://127.0.0.1:4773')).toBe('http://127.0.0.1:4773');
    expect(deckServiceUrl('')).toBe('');
  });
});

describe('words (S-14-1..S-14-4)', () => {
  it('status lines and refusals', () => {
    expect(SYNC_TEXT.pending).toBe("Saved on this device · goes online when you're connected");
    expect(SYNC_TEXT.noDecks).toBe('No decks with that code');
    expect(ONLINE_DECK_TEXT.youPlay('runner')).toBe("You'll play the Runner");
    expect(refusedText([{ kind: 'too_many_copies', cardId: 'c09', copies: 4 } as { kind: string }], IDENTITIES.corp)).toMatch(/^This deck isn't ready to play: 4 copies of /);
    expect(refusedText([{ kind: 'too_small', size: 40, min: 45 } as { kind: string }], IDENTITIES.corp)).toBe("This deck isn't ready to play: 5 cards short");
    expect(refusedText([{ kind: 'something_new' }], IDENTITIES.corp)).toBe("This deck isn't ready to play");
    expect(FAIL_TEXT['version']).toBe('Update the game to play online');
    expect(Object.values(DECK_TEXT)).not.toContain('Online games use the standard decks for now.');
  });
});

// ---- the online match's deck messages (S-14-3) --------------------------------------------------

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: string[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor(readonly url: string) {}
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3;
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(msg: ServerMsg): void {
    this.onmessage?.({ data: encodeMsg(msg) });
  }
  msgs(): Record<string, unknown>[] {
    return this.sent.filter((s) => s.includes('"t"') && !s.includes('"ping"')).map((s) => JSON.parse(s) as Record<string, unknown>);
  }
}

describe('OnlineMatch with decks (S-14-3, S-14-4)', () => {
  let sockets: FakeSocket[];
  let deps: OnlineDeps;
  const clock = new FakeClock();
  beforeEach(() => {
    sockets = [];
    deps = {
      server: 'wss://game.test',
      connect: (url) => {
        const s = new FakeSocket(url);
        sockets.push(s);
        return s;
      },
      storage: new MemStore(),
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
      random: () => 0.5,
      visible: () => true,
    };
  });
  const deck = { identity: IDENTITIES.corp, cards: { c01: 3 } };

  it('the starter sends its deck with create (v = PROTOCOL_VERSION); none for the standard deck', () => {
    OnlineMatch.create(deps, 'corp', undefined, deck);
    sockets[0]!.open();
    expect(sockets[0]!.msgs()[0]).toEqual({ v: PROTOCOL_VERSION, t: 'create', side: 'corp', deck });
    OnlineMatch.create(deps, 'runner');
    sockets[1]!.open();
    expect(sockets[1]!.msgs()[0]).toEqual({ v: PROTOCOL_VERSION, t: 'create', side: 'runner' });
  });

  it('the joiner is told its side (choose), picks, and may be refused and pick again', () => {
    const m = OnlineMatch.join(deps, 'K7QF');
    const phases: OnlinePhase[] = [];
    m.onPhase((p) => phases.push(p));
    const s = sockets[0]!;
    s.open();
    s.receive({ v: PROTOCOL_VERSION, t: 'seated', code: 'K7QF', seat: 'runner', token: 't'.repeat(32) } as ServerMsg);
    s.receive({ v: PROTOCOL_VERSION, t: 'choose', seat: 'runner' } as ServerMsg);
    expect(phases.at(-1)).toEqual({ kind: 'choose', seat: 'runner' });
    expect(m.seat).toBe('runner');
    m.pick(deck);
    expect(s.msgs().at(-1)).toEqual({ v: PROTOCOL_VERSION, t: 'pick', deck });
    s.receive({ v: PROTOCOL_VERSION, t: 'deck_refused', problems: [{ kind: 'too_small', size: 3, min: 45 }] } as ServerMsg);
    expect(phases.at(-1)).toEqual({ kind: 'refused', problems: [{ kind: 'too_small', size: 3, min: 45 }] });
    m.pick();
    expect(s.msgs().at(-1)).toEqual({ v: PROTOCOL_VERSION, t: 'pick' });
    // Giving up while picking gives the seat back.
    m.forget();
    expect(s.msgs().at(-1)).toEqual({ v: PROTOCOL_VERSION, t: 'leave' });
  });

  it('the starter hears when the friend is picking', () => {
    const m = OnlineMatch.create(deps, 'corp');
    const phases: OnlinePhase[] = [];
    m.onPhase((p) => phases.push(p));
    sockets[0]!.open();
    sockets[0]!.receive({ v: PROTOCOL_VERSION, t: 'lobby', code: 'K7QF', seat: 'corp' } as ServerMsg);
    sockets[0]!.receive({ v: PROTOCOL_VERSION, t: 'lobby', code: 'K7QF', seat: 'corp', picking: true } as ServerMsg);
    expect(phases).toEqual([
      { kind: 'lobby', code: 'K7QF', seat: 'corp' },
      { kind: 'lobby', code: 'K7QF', seat: 'corp', picking: true },
    ]);
  });

  it('another protocol version fails with "version" (Update the game to play online)', () => {
    const m = OnlineMatch.join(deps, 'K7QF');
    sockets[0]!.open();
    sockets[0]!.onmessage?.({ data: JSON.stringify({ v: PROTOCOL_VERSION + 1, t: 'lobby', code: 'K7QF', seat: 'corp' }) });
    expect(m.phase).toEqual({ kind: 'failed', reason: 'version' });
  });
});
