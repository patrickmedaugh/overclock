/**
 * Sprint 14 (S-14-1/2): the deck service's HTTP side — `POST /v1/decks/new`, `POST /v1/decks/sync`
 * and their CORS preflights. No `cloudflare:` imports (the Durable Objects are behind the
 * `DeckServices` interface), so Vitest runs it in Node with in-memory lockers and guards.
 *
 * Order for `sync`: read + check the body (`parseDeckRequest`; a refused body never reaches a
 * locker or the guard, except a malformed code, which is a wrong guess) → guard `attempt`
 * (refused while waiting, before any locker is asked) → locker → guard `right` if it existed.
 * The deck code travels only in bodies, never in a URL, and is never logged.
 */
import {
  DECKS_API_VERSION,
  DECKS_NEW_PATH,
  DECKS_SYNC_PATH,
  DECK_API_STATUS,
  MAX_DECK_UPLOAD_BYTES,
  TEST_IP_HEADER,
  makeDeckCode,
  parseDeckRequest,
  type DeckApiError,
  type DeckErrorReply,
  type DeckNewReply,
  type DeckSyncReply,
} from '@overclock/protocol';
import type { DeckStore } from '@overclock/match';
import { guardKey } from './guard';
import type { LockerResult } from './locker';
import { originAllowed } from './origin';

/** What the guard answers over RPC. */
export type GuardReply = { readonly ok: true } | { readonly ok: false; readonly retryAfterMs: number };

export interface GuardApi {
  attempt(): Promise<GuardReply>;
  right(): Promise<void>;
  newLocker(): Promise<GuardReply>;
}
export interface LockerApi {
  create(store: DeckStore): Promise<LockerResult>;
  sync(store: DeckStore): Promise<LockerResult>;
}
export interface DeckServices {
  /** `key` = `guardKey(ip)` (a hash). */
  guard(key: string): GuardApi;
  /** `code` = a normalised deck code. */
  locker(code: string): LockerApi;
}
export interface DeckHttpConfig {
  readonly allowedOrigins: string;
  /** Test mode: TEST_IP_HEADER picks the caller's "IP". */
  readonly testMode: boolean;
  /** Uniform integer in [0, n) from a real random source. */
  readonly randomInt: (n: number) => number;
}

/** How many fresh codes `new` tries when one is taken (2⁵⁹ codes: a clash is practically impossible). */
const NEW_TRIES = 5;

export function isDeckPath(pathname: string): boolean {
  return pathname === DECKS_NEW_PATH || pathname === DECKS_SYNC_PATH;
}

/** The caller's "IP" for the guard: the test header in test mode, else Cloudflare's `CF-Connecting-IP`. */
export function callerIp(req: Request, testMode: boolean): string {
  const test = testMode ? req.headers.get(TEST_IP_HEADER) : null;
  return test ?? req.headers.get('CF-Connecting-IP') ?? 'unknown';
}

function corsHeaders(origin: string, testMode: boolean): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': testMode ? `Content-Type, ${TEST_IP_HEADER}` : 'Content-Type',
    'Access-Control-Expose-Headers': 'Retry-After',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(status: number, body: unknown, cors: Record<string, string>, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors, ...extra } });
}

function fail(error: DeckApiError, cors: Record<string, string>, retryAfterMs?: number): Response {
  if (error === 'wait') {
    const ms = Math.max(0, Math.ceil(retryAfterMs ?? 60_000));
    const body: DeckErrorReply = { v: DECKS_API_VERSION, error, retryAfterMs: ms };
    return json(DECK_API_STATUS.wait, body, cors, { 'Retry-After': String(Math.ceil(ms / 1000)) });
  }
  const body: DeckErrorReply = { v: DECKS_API_VERSION, error };
  return json(DECK_API_STATUS[error], body, cors);
}

/** Answers a request to DECKS_NEW_PATH / DECKS_SYNC_PATH (call only when `isDeckPath`). */
export async function handleDecks(req: Request, cfg: DeckHttpConfig, svc: DeckServices): Promise<Response> {
  const kind = new URL(req.url).pathname === DECKS_NEW_PATH ? 'new' : 'sync';
  const origin = req.headers.get('Origin');
  if (!originAllowed(origin, cfg.allowedOrigins)) return new Response('Forbidden', { status: 403, headers: { Vary: 'Origin' } });
  const cors = corsHeaders(origin!, cfg.testMode);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { ...cors, Allow: 'POST, OPTIONS' } });

  const declared = Number(req.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_DECK_UPLOAD_BYTES) return fail('too_big', cors);
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return fail('bad_store', cors);
  }
  const parsed = parseDeckRequest(kind, raw);
  const guard = svc.guard(guardKey(callerIp(req, cfg.testMode)));

  if (kind === 'new') {
    if (!parsed.ok) return fail(parsed.error, cors);
    const g = await guard.newLocker();
    if (!g.ok) return fail('wait', cors, g.retryAfterMs);
    for (let i = 0; i < NEW_TRIES; i++) {
      const code = makeDeckCode(cfg.randomInt);
      const res = await svc.locker(code).create(parsed.store);
      if (res.ok) return json(200, { v: DECKS_API_VERSION, code, store: res.store } satisfies DeckNewReply, cors);
      if (res.error === 'too_big') return fail('too_big', cors);
    }
    return new Response('No free deck code, try again', { status: 503, headers: cors });
  }

  // sync
  if (!parsed.ok && parsed.error !== 'no_decks') return fail(parsed.error, cors);
  const g = await guard.attempt();
  if (!g.ok) return fail('wait', cors, g.retryAfterMs);
  if (!parsed.ok || parsed.code === undefined) return fail('no_decks', cors); // malformed code: a wrong guess
  const res = await svc.locker(parsed.code).sync(parsed.store);
  if (!res.ok) {
    if (res.error === 'no_decks') return fail('no_decks', cors);
    await guard.right(); // the code was right; only the merged store didn't fit
    return fail('too_big', cors);
  }
  await guard.right();
  return json(200, { v: DECKS_API_VERSION, store: res.store } satisfies DeckSyncReply, cors);
}
