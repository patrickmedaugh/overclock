/**
 * Sprint 14 (S-14-1/2): one deck locker (one per deck code), pure. The Durable Object
 * `DeckLocker` (do.ts) passes its synchronous KV storage; nothing here awaits, so two
 * requests for one code never interleave.
 *
 * Storage: `meta` = `{createdAt}` (present = the locker exists; codes are minted by the server,
 * so a missing `meta` means a wrong guess), `d:<id>` = a StoredDeck, `t:<id>` = a DeckTombstone.
 * No expiry. Every write is the merge rule shared with the client (`mergeDeckStores`), and a
 * refused request writes nothing.
 */
import { DECKS_API_VERSION, DECK_CODE_LENGTH, MAX_DECK_UPLOAD_BYTES, MAX_STORE_DECKS, MAX_STORE_TOMBSTONES, utf8Length } from '@overclock/protocol';
import { mergeDeckStores, type DeckStore, type DeckTombstone, type StoredDeck } from '@overclock/match';

export interface LockerKv {
  get<T>(key: string): T | undefined;
  put(key: string, value: unknown): void;
  delete(key: string): void;
  list<T>(prefix: string): [string, T][];
}

export interface LockerMeta {
  readonly createdAt: number;
}

export type LockerResult = { readonly ok: true; readonly store: DeckStore } | { readonly ok: false; readonly error: 'no_decks' | 'too_big' | 'taken' };

const EMPTY: DeckStore = { format: 2, decks: [], deleted: [] };

/** The stored decks (canonical order), or null when no locker has this code. */
export function readLocker(kv: LockerKv): DeckStore | null {
  if (!kv.get<LockerMeta>('meta')) return null;
  const decks = kv.list<StoredDeck>('d:').map(([, d]) => d);
  const deleted = kv.list<DeckTombstone>('t:').map(([, t]) => t);
  return mergeDeckStores({ format: 2, decks, deleted }, EMPTY);
}

/** A new locker holding `store` (`taken` if this code already has one: the worker mints another). */
export function createLocker(kv: LockerKv, store: DeckStore, now: number): LockerResult {
  if (kv.get<LockerMeta>('meta')) return { ok: false, error: 'taken' };
  const merged = fit(mergeDeckStores(store, EMPTY));
  if (!merged) return { ok: false, error: 'too_big' };
  kv.put('meta', { createdAt: now } satisfies LockerMeta);
  write(kv, EMPTY, merged);
  return { ok: true, store: merged };
}

/** Merges `upload` into the locker and returns the merged store (`no_decks` = no locker with this code). */
export function syncLocker(kv: LockerKv, upload: DeckStore): LockerResult {
  const stored = readLocker(kv);
  if (!stored) return { ok: false, error: 'no_decks' };
  const merged = fit(mergeDeckStores(stored, upload));
  if (!merged) return { ok: false, error: 'too_big' };
  write(kv, stored, merged);
  return { ok: true, store: merged };
}

/**
 * The merged store within the limits, or null if it can't be: more than MAX_STORE_DECKS decks,
 * or a reply the client could not send back (over MAX_DECK_UPLOAD_BYTES as a sync request).
 * Tombstones beyond MAX_STORE_TOMBSTONES: the oldest are dropped (as `checkDeckUpload`).
 */
function fit(store: DeckStore): DeckStore | null {
  if (store.decks.length > MAX_STORE_DECKS) return null;
  let deleted = store.deleted;
  if (deleted.length > MAX_STORE_TOMBSTONES) {
    const keep = new Set(
      [...deleted]
        .sort((p, q) => q.deletedAt - p.deletedAt || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0))
        .slice(0, MAX_STORE_TOMBSTONES)
        .map((t) => t.id),
    );
    deleted = deleted.filter((t) => keep.has(t.id));
  }
  const out: DeckStore = { ...store, deleted };
  const asRequest = JSON.stringify({ v: DECKS_API_VERSION, code: 'X'.repeat(DECK_CODE_LENGTH), store: out });
  if (utf8Length(asRequest) > MAX_DECK_UPLOAD_BYTES) return null;
  return out;
}

/** Writes only what changed between `before` and `after` (both canonical, each id once). */
function write(kv: LockerKv, before: DeckStore, after: DeckStore): void {
  const was = new Map<string, string>();
  for (const d of before.decks) was.set(`d:${d.id}`, JSON.stringify(d));
  for (const t of before.deleted) was.set(`t:${t.id}`, JSON.stringify(t));
  const now = new Map<string, StoredDeck | DeckTombstone>();
  for (const d of after.decks) now.set(`d:${d.id}`, d);
  for (const t of after.deleted) now.set(`t:${t.id}`, t);
  for (const key of was.keys()) if (!now.has(key)) kv.delete(key);
  for (const [key, value] of now) if (was.get(key) !== JSON.stringify(value)) kv.put(key, value);
}
