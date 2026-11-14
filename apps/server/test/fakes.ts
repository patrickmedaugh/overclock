// Test doubles for the room: an in-memory store, sockets that record what they get, a clock.
import { parseServerMsg, type ServerMsg } from '@overclock/protocol';
import { Room, type Conn, type ConnRole, type RoomDeps, type RoomStore } from '../src/room';

export class MemStore implements RoomStore {
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
  list<T>(prefix: string): [string, T][] {
    return [...this.data.keys()]
      .filter((k) => k.startsWith(prefix))
      .sort()
      .map((k) => [k, JSON.parse(this.data.get(k)!) as T]);
  }
  deleteAll(): void {
    this.data.clear();
  }
}

export class FakeConn implements Conn {
  readonly raw: string[] = [];
  closed: { code: number; reason: string } | null = null;
  role: ConnRole | null = null;
  constructor(readonly name = 'conn') {}
  send(text: string): void {
    if (this.closed) throw new Error(`${this.name}: send after close`);
    this.raw.push(text);
  }
  close(code: number, reason: string): void {
    this.closed = { code, reason };
  }
  setRole(role: ConnRole): void {
    this.role = role;
  }
  /** Every message received, parsed (each must parse). */
  get msgs(): ServerMsg[] {
    return this.raw.map((r) => {
      const p = parseServerMsg(r);
      if (!p.ok) throw new Error(`${this.name}: unparseable frame ${r}`);
      return p.msg;
    });
  }
  /** Messages received since the last `take()`. */
  private seen = 0;
  take(): ServerMsg[] {
    const out = this.msgs.slice(this.seen);
    this.seen = this.raw.length;
    return out;
  }
  last(): ServerMsg {
    return this.msgs[this.msgs.length - 1]!;
  }
}

export class Clock {
  constructor(public t = 1_700_000_000_000) {}
  now = () => this.t;
}

/** Deterministic "real" randomness for tests. */
export function testRandom(seed = 1): { random: () => number; randomBytes: (n: number) => Uint8Array } {
  let x = seed >>> 0 || 1;
  const next = () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x;
  };
  return { random: () => next() / 0x100000000, randomBytes: (n) => Uint8Array.from({ length: n }, () => next() & 255) };
}

export interface Harness {
  room: Room;
  store: MemStore;
  clock: Clock;
  deps: RoomDeps;
}

export function harness(opts: Partial<RoomDeps> & { store?: MemStore; clock?: Clock; rngSeed?: number } = {}): Harness {
  const store = opts.store ?? new MemStore();
  const clock = opts.clock ?? new Clock();
  const rnd = testRandom(opts.rngSeed ?? 1);
  const deps: RoomDeps = {
    now: clock.now,
    random: opts.random ?? rnd.random,
    randomBytes: opts.randomBytes ?? rnd.randomBytes,
    build: opts.build ?? 'b1',
    testMode: opts.testMode ?? false,
  };
  return { room: new Room(store, deps), store, clock, deps };
}

export const msg = (o: object): string => JSON.stringify({ v: 1, ...o });
