/**
 * Sprint 6: the Durable Object for one game (one per code, SQLite-backed). A thin
 * wrapper: sockets (hibernation API), storage (synchronous KV), the alarm, the clock
 * and randomness are adapted to the pure `Room` in room.ts, which holds all the logic.
 */
import { DurableObject } from 'cloudflare:workers';
import { PING, PONG } from '@overclock/protocol';
import { Room, type Conn, type ConnRole, type RoomDeps, type RoomStore } from './room';

export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
  /** Comma-separated origins allowed to open sockets (see origin.ts). */
  ALLOWED_ORIGINS: string;
  /** The deployed build id (the git commit in CI; `dev` locally). */
  BUILD: string;
  /** `'1'` = test mode (`create` may carry a seed and actions). Never set in production. */
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
    testMode: env.OVERCLOCK_TEST_MODE === '1',
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
