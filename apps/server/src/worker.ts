/**
 * Sprint 6: the Worker (entry point). Routes:
 * - `GET /health` → `{ok, build, protocol}`
 * - WebSocket `GET /v1/create` → picks a free game code and hands the socket to that game's room
 * - WebSocket `GET /v1/games/<CODE>` → that game's room
 * Only browser pages from ALLOWED_ORIGINS may open sockets. No HTTP API (so no CORS).
 */
import { CREATE_PATH, GAME_PATH_PREFIX, HEALTH_PATH, PROTOCOL_VERSION, encodeMsg, isGameCode, makeCode, normalizeCode, type Health } from '@overclock/protocol';
import { GameRoom, type Env } from './do';
import { originAllowed } from './origin';

export { GameRoom };

/** How many codes `/v1/create` tries before giving up (a code in use is skipped). */
const CREATE_TRIES = 5;

function randomInt(n: number): number {
  // Rejection sampling: uniform in [0, n).
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0]! < limit) return buf[0]! % n;
  }
}

/** Answers a socket with one `error` and closes it (no room involved). */
function refuseSocket(code: 'no_game'): Response {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
  server.accept();
  server.send(encodeMsg({ v: 1, t: 'error', code }));
  server.close(4000, code);
  return new Response(null, { status: 101, webSocket: client });
}

function forward(env: Env, req: Request, code: string, mode: 'create' | 'join'): Promise<Response> {
  const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(code));
  const headers = new Headers(req.headers);
  headers.set('X-Overclock-Code', code);
  headers.set('X-Overclock-Mode', mode);
  return stub.fetch(new Request(req.url, { method: 'GET', headers }));
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === HEALTH_PATH) {
      const body: Health = { ok: true, build: env.BUILD, protocol: PROTOCOL_VERSION };
      return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
    }
    const isCreate = url.pathname === CREATE_PATH;
    const isGame = url.pathname.startsWith(GAME_PATH_PREFIX);
    if (!isCreate && !isGame) return new Response('Not found', { status: 404 });
    if (req.method !== 'GET' || req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket', { status: 426 });
    }
    if (!originAllowed(req.headers.get('Origin'), env.ALLOWED_ORIGINS)) return new Response('Forbidden', { status: 403 });

    if (isCreate) {
      for (let i = 0; i < CREATE_TRIES; i++) {
        const res = await forward(env, req, makeCode(randomInt), 'create');
        if (res.status === 101) return res;
      }
      return new Response('No free game code, try again', { status: 503 });
    }
    let raw = url.pathname.slice(GAME_PATH_PREFIX.length);
    try {
      raw = decodeURIComponent(raw);
    } catch {
      raw = '';
    }
    const code = normalizeCode(raw);
    if (!isGameCode(code)) return refuseSocket('no_game');
    return forward(env, req, code, 'join');
  },
} satisfies ExportedHandler<Env>;
