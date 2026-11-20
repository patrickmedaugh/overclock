// Sprint 14: test doubles for the deck service — in-memory Durable Objects (lockers and guards
// over the pure locker.ts / guard.ts) behind the real HTTP handler (decks.ts).
import { DECKS_NEW_PATH, DECKS_SYNC_PATH, TEST_IP_HEADER, parseDeckReply } from '@overclock/protocol';
import type { DeckStore, StoredDeck } from '@overclock/match';
import { handleDecks, type DeckServices } from '../src/decks';
import { attempt, newLocker, right, type GuardAnswer, type GuardState } from '../src/guard';
import { createLocker, syncLocker, type LockerKv } from '../src/locker';
import { Clock } from './fakes';

export const ORIGIN = 'https://patrickmedaugh.github.io';
export const ALLOWED = 'https://patrickmedaugh.github.io,https://localhost';
export const T = 1_763_600_000_000;

/** In-memory synchronous KV (values stored as JSON, like the real storage). */
export class MemKv implements LockerKv {
  readonly data = new Map<string, string>();
  writes = 0;
  get<T>(key: string): T | undefined {
    const v = this.data.get(key);
    return v === undefined ? undefined : (JSON.parse(v) as T);
  }
  put(key: string, value: unknown): void {
    this.writes++;
    this.data.set(key, JSON.stringify(value));
  }
  delete(key: string): void {
    this.writes++;
    this.data.delete(key);
  }
  list<T>(prefix: string): [string, T][] {
    return [...this.data.keys()]
      .filter((k) => k.startsWith(prefix))
      .sort()
      .map((k) => [k, JSON.parse(this.data.get(k)!) as T]);
  }
}

export function deck(id: string, over: Partial<StoredDeck> = {}): StoredDeck {
  return { id, side: 'corp', name: `Deck ${id}`, identity: 'c13', cards: { c01: 3 }, createdAt: T, updatedAt: T, ...over };
}
export function ownStore(...ids: string[]): DeckStore {
  return { format: 2, decks: ids.map((id) => deck(id)), deleted: [] };
}

export interface PostOpts {
  readonly ip?: string;
  readonly origin?: string | null;
  readonly method?: string;
  readonly headers?: Record<string, string>;
}

export class DeckWorld {
  readonly clock = new Clock(T);
  readonly lockers = new Map<string, MemKv>();
  readonly guards = new Map<string, GuardState>();
  lockerCalls = 0;
  private n = 0;
  readonly testMode: boolean;

  constructor(opts: { testMode?: boolean; codes?: string[] } = {}) {
    this.testMode = opts.testMode ?? true;
    this.fixedCodes = opts.codes ? [...opts.codes] : null;
  }
  private fixedCodes: string[] | null;

  get lockerCount(): number {
    return [...this.lockers.values()].filter((kv) => kv.get('meta')).length;
  }

  readonly services: DeckServices = {
    guard: (key) => {
      const run = async (f: (s: GuardState | undefined, now: number) => GuardAnswer) => {
        const a = f(this.guards.get(key), this.clock.now());
        this.guards.set(key, a.state);
        return a.ok ? ({ ok: true } as const) : ({ ok: false, retryAfterMs: a.retryAfterMs } as const);
      };
      return {
        attempt: () => run(attempt),
        newLocker: () => run(newLocker),
        right: async () => {
          this.guards.set(key, right(this.guards.get(key), this.clock.now()));
        },
      };
    },
    locker: (code) => {
      const kv = () => {
        let k = this.lockers.get(code);
        if (!k) this.lockers.set(code, (k = new MemKv()));
        return k;
      };
      return {
        create: async (store) => {
          this.lockerCalls++;
          return createLocker(kv(), structuredClone(store), this.clock.now());
        },
        sync: async (store) => {
          this.lockerCalls++;
          return syncLocker(kv(), structuredClone(store));
        },
      };
    },
  };

  /** Code minting: fixed codes first (to test clashes), then a counter-based "random". */
  randomInt = (n: number): number => {
    if (this.fixedCodes && this.fixedCodes.length) {
      // Feed the next fixed code one character at a time.
      const code = this.fixedCodes[0]!;
      const ch = code[this.charAt++]!;
      if (this.charAt === code.length) {
        this.charAt = 0;
        this.fixedCodes.shift();
      }
      return 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'.indexOf(ch);
    }
    this.n = (this.n * 1103515245 + 12345 + 7) >>> 0;
    return (this.n >>> 8) % n;
  };
  private charAt = 0;

  request(path: string, body: unknown, opts: PostOpts = {}): Request {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...opts.headers };
    if (opts.origin !== null) headers.Origin = opts.origin ?? ORIGIN;
    if (opts.ip !== undefined) headers[TEST_IP_HEADER] = opts.ip;
    const method = opts.method ?? 'POST';
    return new Request(`https://overclock.example.workers.dev${path}`, {
      method,
      headers,
      body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
  }

  post(path: string, body: unknown, opts: PostOpts = {}): Promise<Response> {
    return handleDecks(this.request(path, body, opts), { allowedOrigins: ALLOWED, testMode: this.testMode, randomInt: this.randomInt }, this.services);
  }

  async newCode(store: DeckStore, ip = 'dev'): Promise<{ code: string; store: DeckStore }> {
    const r = await this.post(DECKS_NEW_PATH, { v: 1, store }, { ip });
    const p = parseDeckReply(r.status, await r.text());
    if (!p.ok || !p.code) throw new Error(`new failed: ${r.status} ${JSON.stringify(p)}`);
    return { code: p.code, store: p.store };
  }

  async sync(code: string, store: DeckStore, ip = 'dev'): Promise<{ status: number; store: DeckStore }> {
    const r = await this.post(DECKS_SYNC_PATH, { v: 1, code, store }, { ip });
    const p = parseDeckReply(r.status, await r.text());
    if (!p.ok) throw new Error(`sync failed: ${r.status} ${JSON.stringify(p)}`);
    return { status: r.status, store: p.store };
  }
}
