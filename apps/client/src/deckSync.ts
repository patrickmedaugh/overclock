// Sprint 14 (S-14-1, S-14-2): keeps a copy of the player's decks with the online deck service, so
// the same decks show up on every device linked with the deck code. No rules here: the merge is
// `mergeDeckStores` (`@overclock/match`, run by the library), the code and the replies come from
// `@overclock/protocol`.
//
// The whole store is sent every time (a few KB; sending it twice does no harm), so the "offline
// queue" is just a counter: every local deck write bumps `rev`; `syncedRev` is the `rev` the
// service has. Nothing here is ever awaited by a tap: the deck screens never wait on the network.
import {
  DECKS_API_VERSION,
  DECKS_NEW_PATH,
  DECKS_SYNC_PATH,
  DECK_SYNC_STORAGE_KEY,
  type DeckReply,
  type StoredDeckSync,
  isDeckCode,
  normalizeCode,
  parseDeckReply,
} from '@overclock/protocol';
import type { DeckLibrary } from './deckStore';
import type { StoreLike } from './online';

/**
 * What the Decks screen says: `saved` "✓ Saved online", `saving` (on its way), `pending` "Saved on
 * this device · goes online when you're connected" (offline, or the last try failed), `none` (no
 * line: no decks of your own and no code, so nothing goes online).
 */
export type SyncStatus = 'none' | 'saving' | 'pending' | 'saved';

/** Timing (ms), tech plan: 1.5 s after a write; every 10 s while Decks is open; failures retry 5/15/60 s. */
export const SYNC_TIMING = {
  afterWrite: 1500,
  poll: 10_000,
  retry: [5000, 15_000, 60_000],
  /** A request with no answer by then counts as failed (a hanging network never blocks the next sync). */
  requestWait: 15_000,
} as const;

/** The part of a `fetch` response the sync reads. */
export interface HttpReply {
  readonly status: number;
  text(): Promise<string>;
}

export interface DeckSyncDeps {
  /** The deck service's base address (`https://host`); '' = no online service in this build. */
  server: string;
  storage: StoreLike | null;
  library: DeckLibrary;
  post(url: string, body: string, headers: Record<string, string>): Promise<HttpReply>;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  now(): number;
  /** The browser thinks it has a network (`navigator.onLine`). */
  online(): boolean;
  /** Extra request headers (test builds only: the test "device" for the guess limit). */
  headers?: Record<string, string>;
}

export type LinkResult =
  | { ok: true }
  | { ok: false; reason: 'bad_code' | 'no_decks' | 'network' }
  | { ok: false; reason: 'wait'; waitMs: number };

export type CodeResult = { ok: true; code: string } | { ok: false; reason: 'network' } | { ok: false; reason: 'wait'; waitMs: number };

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Reads what the device remembers for `server` (a fresh record for another server or broken data). */
export function readDeckSync(storage: StoreLike | null, server: string, hasOwn: boolean): Mutable<StoredDeckSync> {
  const fresh: Mutable<StoredDeckSync> = { server, rev: hasOwn ? 1 : 0, syncedRev: 0 };
  try {
    const raw = storage?.getItem(DECK_SYNC_STORAGE_KEY);
    if (!raw) return fresh;
    const s = JSON.parse(raw) as Partial<StoredDeckSync>;
    const count = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;
    if (s.server !== server || !count(s.rev) || !count(s.syncedRev) || s.syncedRev > s.rev) return fresh;
    const out: Mutable<StoredDeckSync> = { server, rev: s.rev, syncedRev: s.syncedRev };
    if (typeof s.code === 'string' && isDeckCode(s.code)) out.code = s.code;
    if (typeof s.lockUntil === 'number' && Number.isFinite(s.lockUntil)) out.lockUntil = s.lockUntil;
    return out;
  } catch {
    return fresh;
  }
}

/** The deck service's address for a game service address (`wss://h/x` → `https://h`). '' if none. */
export function deckServiceUrl(gameServer: string): string {
  if (!gameServer) return '';
  try {
    const u = new URL(gameServer);
    const scheme = u.protocol === 'wss:' || u.protocol === 'https:' ? 'https:' : 'http:';
    return `${scheme}//${u.host}`;
  } catch {
    return '';
  }
}

export class DeckSync {
  private st: Mutable<StoredDeckSync>;
  private inFlight: Promise<void> | null = null;
  /** Another sync was asked for while one was on its way. */
  private again = false;
  private timer: unknown = null;
  private pollTimer: unknown = null;
  private failures = 0;
  private failed = false;
  private lastStatus: SyncStatus;
  private readonly listeners = new Set<(s: SyncStatus) => void>();
  /** Requests sent (tests). */
  requests = 0;

  constructor(private readonly deps: DeckSyncDeps) {
    this.st = readDeckSync(deps.storage, deps.server, deps.library.hasOwn());
    // Sprint 13 decks that were never online count as a change to send.
    if (!this.st.code && this.st.rev === this.st.syncedRev && deps.library.hasOwn()) this.st.rev++;
    deps.library.onChange((c) => {
      if (c !== 'local' || !this.enabled) return;
      this.st.rev++;
      this.persist();
      this.emit();
      this.schedule(SYNC_TIMING.afterWrite);
    });
    this.lastStatus = this.status();
  }

  /** False without an online service, or for a newer build's (read-only) store. */
  get enabled(): boolean {
    return this.deps.server !== '' && !this.deps.library.readOnly;
  }

  /** The deck code (normalised), or null before the first deck went online. */
  get code(): string | null {
    return this.st.code ?? null;
  }

  /** "I have a deck code" is disabled until then (ms since the epoch), after too many wrong codes. */
  get lockUntil(): number {
    return this.st.lockUntil ?? 0;
  }

  /** What's kept (test hook). */
  info(): { status: SyncStatus; code: string | null; rev: number; syncedRev: number } {
    return { status: this.status(), code: this.code, rev: this.st.rev, syncedRev: this.st.syncedRev };
  }

  status(): SyncStatus {
    if (!this.enabled) return 'none';
    if (!this.st.code && !this.deps.library.hasOwn()) return 'none';
    if (this.st.code && this.st.rev === this.st.syncedRev) return 'saved';
    if (this.failed || !this.deps.online()) return 'pending';
    return 'saving';
  }

  onStatus(fn: (s: SyncStatus) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** The network came or went (`online` / `offline` events): the line may change. */
  networkChanged(): void {
    this.emit();
    if (this.deps.online()) {
      this.failures = 0;
      void this.syncNow();
    }
  }

  /**
   * Sends the store now (and merges the answer in). Does nothing while there is nothing to keep
   * online (no own deck, no delete, no code: AC "nothing is sent"). Never throws.
   */
  syncNow(): Promise<void> {
    if (!this.enabled) return Promise.resolve();
    if (!this.st.code && !this.deps.library.hasOwn()) return Promise.resolve();
    if (this.inFlight) {
      this.again = true;
      return this.inFlight;
    }
    this.clearTimer();
    return this.track(this.run(false));
  }

  /** Polls every 10 s while on (the Decks screen open and on screen). */
  setPolling(on: boolean): void {
    if (this.pollTimer !== null) this.deps.clearTimeout(this.pollTimer);
    this.pollTimer = null;
    if (!on || !this.enabled) return;
    const tick = () => {
      this.pollTimer = this.deps.setTimeout(() => {
        if (this.st.code) void this.syncNow();
        tick();
      }, SYNC_TIMING.poll);
    };
    tick();
  }

  /** "My deck code": the code, asking the service for one first if this device has none (even with no decks: the player asked). */
  async myCode(): Promise<CodeResult> {
    if (!this.enabled) return { ok: false, reason: 'network' };
    await this.settle();
    if (this.st.code) return { ok: true, code: this.st.code };
    let result: CodeResult = { ok: false, reason: 'network' };
    await this.track(
      this.run(true, (r) => {
        if (this.st.code) result = { ok: true, code: this.st.code };
        else if (!r.ok && r.error === 'wait') result = { ok: false, reason: 'wait', waitMs: r.retryAfterMs ?? 60_000 };
      }),
    );
    return result;
  }

  /**
   * "I have a deck code": links this device to `typed` (owner Q2 A: this device's decks are kept
   * and go online too; any old code is forgotten).
   */
  async link(typed: string): Promise<LinkResult> {
    const code = normalizeCode(typed);
    if (!isDeckCode(code)) return { ok: false, reason: 'bad_code' };
    if (!this.enabled) return { ok: false, reason: 'network' };
    const wait = this.lockUntil - this.deps.now();
    if (wait > 0) return { ok: false, reason: 'wait', waitMs: wait };
    await this.settle();
    this.clearTimer();
    let result: LinkResult = { ok: false, reason: 'network' };
    const job = (async () => {
      const sentRev = this.st.rev;
      const reply = await this.post(DECKS_SYNC_PATH, { v: DECKS_API_VERSION, code, store: this.deps.library.snapshot() });
      if (reply.ok) {
        this.st.code = code;
        delete this.st.lockUntil;
        this.st.syncedRev = sentRev;
        this.succeeded();
        this.deps.library.applyRemote(reply.store);
        result = { ok: true };
      } else if (reply.error === 'no_decks') {
        result = { ok: false, reason: 'no_decks' };
      } else if (reply.error === 'wait') {
        const ms = reply.retryAfterMs ?? 60_000;
        this.st.lockUntil = this.deps.now() + ms;
        result = { ok: false, reason: 'wait', waitMs: ms };
      }
      this.persist();
      this.emit();
      if (this.st.rev > this.st.syncedRev) this.schedule(0);
    })();
    await this.track(job);
    return result;
  }

  // ---- internals ------------------------------------------------------------------------------

  private async settle(): Promise<void> {
    while (this.inFlight) await this.inFlight.catch(() => undefined);
  }

  private track(p: Promise<void>): Promise<void> {
    const t = p
      .catch(() => undefined)
      .finally(() => {
        if (this.inFlight === t) this.inFlight = null;
        this.emit();
        if (this.again) {
          this.again = false;
          this.schedule(0);
        }
      });
    this.inFlight = t;
    this.emit();
    return t;
  }

  /** One request: `new` when there is no code yet, else `sync`. */
  private async run(force: boolean, after?: (r: DeckReply) => void): Promise<void> {
    if (!force && !this.st.code && !this.deps.library.hasOwn()) return;
    const sentRev = this.st.rev;
    const code = this.st.code;
    const store = this.deps.library.snapshot();
    const reply = code
      ? await this.post(DECKS_SYNC_PATH, { v: DECKS_API_VERSION, code, store })
      : await this.post(DECKS_NEW_PATH, { v: DECKS_API_VERSION, store });
    if (reply.ok && !code && !reply.code) {
      this.fail({ ok: false, error: 'bad_reply' });
    } else if (reply.ok) {
      // Linked to another code meanwhile: the answer still merges in (both are this player's decks),
      // but what the new locker has is not known yet.
      if (this.st.code === code || !code) {
        if (!code) this.st.code = reply.code;
        this.st.syncedRev = Math.max(this.st.syncedRev, sentRev);
      } else this.again = true;
      this.succeeded();
      this.deps.library.applyRemote(reply.store);
    } else {
      // The service no longer knows this code (it can't happen unless its storage was lost): the
      // decks are still here, so the next sync asks for a new code.
      if (reply.error === 'no_decks' && code && this.st.code === code) delete this.st.code;
      this.fail(reply);
    }
    this.persist();
    after?.(reply);
    if (this.st.rev > this.st.syncedRev && !this.failed) this.again = true;
  }

  private succeeded(): void {
    this.failed = false;
    this.failures = 0;
  }

  private fail(reply: DeckReply): void {
    this.failed = true;
    const step = SYNC_TIMING.retry[Math.min(this.failures, SYNC_TIMING.retry.length - 1)]!;
    this.failures++;
    const wait = !reply.ok && reply.error === 'wait' ? Math.max(reply.retryAfterMs ?? step, step) : step;
    this.schedule(wait);
  }

  private async post(path: string, body: object): Promise<DeckReply> {
    this.requests++;
    let timer: unknown = null;
    const timeout = new Promise<DeckReply>((resolve) => {
      timer = this.deps.setTimeout(() => resolve({ ok: false, error: 'bad_reply' }), SYNC_TIMING.requestWait);
    });
    const request = (async (): Promise<DeckReply> => {
      try {
        // text/plain: a "simple" request (no CORS preflight, one round trip); the body is JSON.
        const res = await this.deps.post(`${this.deps.server}${path}`, JSON.stringify(body), { 'Content-Type': 'text/plain;charset=UTF-8', ...this.deps.headers });
        return parseDeckReply(res.status, await res.text());
      } catch {
        return { ok: false, error: 'bad_reply' };
      }
    })();
    const reply = await Promise.race([request, timeout]);
    if (timer !== null) this.deps.clearTimeout(timer);
    return reply;
  }

  private schedule(ms: number): void {
    if (!this.enabled) return;
    this.clearTimer();
    this.timer = this.deps.setTimeout(() => {
      this.timer = null;
      void this.syncNow();
    }, ms);
  }

  private clearTimer(): void {
    if (this.timer !== null) this.deps.clearTimeout(this.timer);
    this.timer = null;
  }

  private persist(): void {
    try {
      this.deps.storage?.setItem(DECK_SYNC_STORAGE_KEY, JSON.stringify(this.st));
    } catch {
      // storage full / blocked: the sync still runs while the page is open
    }
  }

  private emit(): void {
    const s = this.status();
    if (s === this.lastStatus) return;
    this.lastStatus = s;
    for (const fn of this.listeners) fn(s);
  }
}
