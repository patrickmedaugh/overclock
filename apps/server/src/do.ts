/**
 * Sprint 6: the Durable Object for one game (one per code, SQLite-backed). A thin
 * wrapper: sockets (hibernation API), storage (synchronous KV), the alarm, the clock
 * and randomness are adapted to the pure `Room` in room.ts, which holds all the logic.
 */
import { DurableObject } from 'cloudflare:workers';
import { PING, PONG } from '@overclock/protocol';
import type { DeckStore } from '@overclock/match';
import { testModeOn } from './config';
import type { GuardReply } from './decks';
import { GUARD_FORGET_MS, attempt, newLocker, right, type GuardAnswer, type GuardState } from './guard';
import { createLocker, syncLocker, type LockerKv, type LockerResult } from './locker';
import { Room, type Conn, type ConnRole, type RoomDeps, type RoomStore } from './room';

export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
  /** Sprint 14: one deck locker per deck code. */
  DECK_LOCKER: DurableObjectNamespace<DeckLocker>;
  /** Sprint 14: one wrong-guess guard per caller (keyed by a hash of the IP). */
  GUESS_GUARD: DurableObjectNamespace<GuessGuard>;
  /** Comma-separated origins allowed to open sockets (see origin.ts). */
  ALLOWED_ORIGINS: string;
  /** The deployed build id (the git commit in CI; `dev` locally). */
  BUILD: string;
  /** `'1'` = test mode (`create` may carry a seed and actions), honoured only when BUILD is `dev` (config.ts). */
  OVERCLOCK_TEST_MODE?: string;
}

function kvStore(kv: SyncKvStorage): RoomStore {
  return {
    get: <T>(key: string) => kv.get<T>(key),
    put: (key, value) => kv.put(key, value),
    list: <T>(prefix: string) => [...kv.list<T>({ prefix })],
    deleteAll: () => {
      for (const [key] of [...kv.list()]) kv.delete(key);
    },
  };
}

function deps(env: Env): RoomDeps {
  return {
    now: () => Date.now(),
    random: () => crypto.getRandomValues(new Uint32Array(1))[0]! / 0x100000000,
    randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
    build: env.BUILD,
    testMode: testModeOn(env),
  };
}

export class GameRoom extends DurableObject<Env> {
  private room: Room | null = null;
  private readonly conns = new WeakMap<WebSocket, Conn>();
  /** The alarm time last written (undefined = unknown after a wake). */
  private alarmAt: number | null | undefined = undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Pings are answered by the runtime without waking the game (free while idle).
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  override async fetch(req: Request): Promise<Response> {
    const room = this.getRoom();
    const mode = req.headers.get('X-Overclock-Mode');
    const code = req.headers.get('X-Overclock-Code') ?? '';
    if (mode === 'create' && !room.canCreate()) return new Response('Game code in use', { status: 409 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    room.connect(this.conn(server), mode === 'create' ? { kind: 'creator', code } : { kind: 'player' });
    await this.syncAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    this.getRoom().message(this.conn(ws), message);
    await this.syncAlarm();
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    this.getRoom().disconnect(this.conn(ws));
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {
      // already closed
    }
    await this.syncAlarm();
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.getRoom().disconnect(this.conn(ws));
    await this.syncAlarm();
  }

  override async alarm(): Promise<void> {
    this.alarmAt = null; // a fired alarm is gone
    this.getRoom().alarm();
    await this.syncAlarm();
  }

  /** The room, restored from storage on first use after a (re)start, with its open sockets reattached. */
  private getRoom(): Room {
    if (!this.room) {
      const room = new Room(kvStore(this.ctx.storage.kv), deps(this.env));
      this.room = room;
      for (const ws of this.ctx.getWebSockets()) {
        const role = ws.deserializeAttachment() as ConnRole | null;
        if (role) room.reattach(this.conn(ws), role);
      }
    }
    return this.room;
  }

  private conn(ws: WebSocket): Conn {
    let c = this.conns.get(ws);
    if (!c) {
      c = {
        send: (text) => ws.send(text),
        close: (code, reason) => ws.close(code, reason),
        setRole: (role) => ws.serializeAttachment(role),
      };
      this.conns.set(ws, c);
    }
    return c;
  }

  private async syncAlarm(): Promise<void> {
    const at = this.room?.nextWakeAt() ?? null;
    if (at === this.alarmAt) return;
    if (at === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(at);
    this.alarmAt = at;
  }
}

function lockerKv(kv: SyncKvStorage): LockerKv {
  return {
    get: <T>(key: string) => kv.get<T>(key),
    put: (key, value) => kv.put(key, value),
    delete: (key) => {
      kv.delete(key);
    },
    list: <T>(prefix: string) => [...kv.list<T>({ prefix })],
  };
}

/**
 * Sprint 14: the Durable Object for one deck code (SQLite-backed, no expiry). A thin RPC wrapper
 * around the pure locker.ts; its storage is synchronous, so two requests never interleave.
 */
export class DeckLocker extends DurableObject<Env> {
  create(store: DeckStore): LockerResult {
    return createLocker(lockerKv(this.ctx.storage.kv), store, Date.now());
  }

  sync(store: DeckStore): LockerResult {
    return syncLocker(lockerKv(this.ctx.storage.kv), store);
  }
}

/**
 * Sprint 14: the wrong-guess guard for one caller (keyed by a SHA-256 of the IP, never the IP).
 * A thin RPC wrapper around the pure guard.ts; forgets itself a day after its last use (alarm).
 */
export class GuessGuard extends DurableObject<Env> {
  async attempt(): Promise<GuardReply> {
    return this.save(attempt(this.load(), Date.now()));
  }

  async right(): Promise<void> {
    await this.store(right(this.load(), Date.now()));
  }

  async newLocker(): Promise<GuardReply> {
    return this.save(newLocker(this.load(), Date.now()));
  }

  override async alarm(): Promise<void> {
    const s = this.load();
    if (s && Date.now() - s.seenAt <= GUARD_FORGET_MS) return this.ctx.storage.setAlarm(s.seenAt + GUARD_FORGET_MS + 60_000);
    this.ctx.storage.kv.delete('g');
  }

  private load(): GuardState | undefined {
    return this.ctx.storage.kv.get<GuardState>('g');
  }

  private async save(a: GuardAnswer): Promise<GuardReply> {
    await this.store(a.state);
    return a.ok ? { ok: true } : { ok: false, retryAfterMs: a.retryAfterMs };
  }

  private async store(s: GuardState): Promise<void> {
    this.ctx.storage.kv.put('g', s);
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(s.seenAt + GUARD_FORGET_MS + 60_000);
  }
}
