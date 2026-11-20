// Sprint 13 (S-13-4): the player's decks on this device. I/O only: the format and its checks
// live in `@overclock/match` (`parseDeckStore`), the rules in `@overclock/cards`. One key in
// localStorage (`overclock.decks.v1`); the Android app's WebView keeps it across app closes,
// the browser keeps its own (owner Q4 A). Every storage call is wrapped: a blocked or full
// storage never stops the screens (the decks then last until the page closes).
import { type DeckDef, IDENTITIES, STANDARD_DECKS, countsOf, deckFromCounts } from '@overclock/cards';
import type { Side } from '@overclock/engine';
import { DECK_STORE_FORMAT, type DeckStore, type StoredDeck, parseDeckStore } from '@overclock/match';
import type { StoreLike } from './online';
import { newDeckName } from './deckText';

export const DECKS_KEY = 'overclock.decks.v1';
/** Broken data is copied here, never silently overwritten. */
export const DECKS_BAK_KEY = 'overclock.decks.v1.bak';

/** The standard decks' ids (never stored, read-only). */
export const STANDARD_ID: Readonly<Record<Side, string>> = { corp: 'standard-corp', runner: 'standard-runner' };

/** A deck as the screens see it: one of the player's, or a standard deck (`standard`, read-only). */
export interface DeckEntry {
  readonly id: string;
  readonly side: Side;
  readonly name: string;
  readonly identity: string;
  readonly cards: Readonly<Record<string, number>>;
  readonly standard: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** The deck list to deal (canonical order, `deckFromCounts`). */
export function dealOf(d: Pick<DeckEntry, 'identity' | 'cards'>): DeckDef {
  return deckFromCounts(d.identity, d.cards);
}

/** A random id (UUID v4 where the browser has one). */
export function makeDeckId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export interface DeckLibraryDeps {
  /** Runs the write later (after the tap's frame); flush() writes at once. */
  schedule?: (fn: () => void) => unknown;
  now?: () => number;
  newId?: () => string;
}

/**
 * The player's decks plus the two standard decks. Changes are kept in memory at once and written
 * after the tap's frame (`schedule`); `flush()` writes now (leaving the editor, the page hidden).
 */
export class DeckLibrary {
  /** A newer build's store: shown, never changed or written. */
  readonly readOnly: boolean;
  private decks: StoredDeck[];
  private scheduled = false;
  private dirty = false;
  private readonly schedule: (fn: () => void) => unknown;
  private readonly now: () => number;
  private readonly newId: () => string;
  /** Writes done (tests). */
  writes = 0;

  constructor(
    private readonly storage: StoreLike | null,
    deps: DeckLibraryDeps = {},
  ) {
    this.schedule = deps.schedule ?? ((fn) => setTimeout(fn, 0));
    this.now = deps.now ?? Date.now;
    this.newId = deps.newId ?? makeDeckId;
    const read = readDeckStore(storage);
    this.readOnly = read === 'newer';
    this.decks = read === 'newer' ? readNewerDecks(storage) : [...read.decks];
  }

  /** The standard deck of `side` (read-only). */
  standard(side: Side): DeckEntry {
    return { id: STANDARD_ID[side], side, name: '', identity: IDENTITIES[side], cards: countsOf(STANDARD_DECKS[side]), standard: true, createdAt: 0, updatedAt: 0 };
  }

  /** The player's decks of `side`, oldest first. */
  mine(side: Side): DeckEntry[] {
    return this.decks.filter((d) => d.side === side).map(entry);
  }

  get(id: string): DeckEntry | null {
    if (id === STANDARD_ID.corp) return this.standard('corp');
    if (id === STANDARD_ID.runner) return this.standard('runner');
    const d = this.decks.find((x) => x.id === id);
    return d ? entry(d) : null;
  }

  /** A new deck of `side`: a copy of `from`'s cards (or empty), named "My Corp deck N". */
  create(side: Side, from: Readonly<Record<string, number>> | null): DeckEntry {
    const t = this.now();
    const d: StoredDeck = {
      id: this.newId(),
      side,
      name: newDeckName(side, this.decks.filter((x) => x.side === side).map((x) => x.name)),
      identity: IDENTITIES[side],
      cards: from ? { ...from } : {},
      createdAt: t,
      updatedAt: t,
    };
    this.change(() => this.decks.push(d));
    return entry(d);
  }

  /** Sets `cardId`'s copies in deck `id` (0 removes it). */
  setCount(id: string, cardId: string, copies: number): void {
    this.update(id, (d) => {
      const cards = { ...d.cards };
      if (copies > 0) cards[cardId] = copies;
      else delete cards[cardId];
      return { ...d, cards };
    });
  }

  rename(id: string, name: string): void {
    const n = name.trim().slice(0, 40);
    if (!n) return;
    this.update(id, (d) => (d.name === n ? d : { ...d, name: n }));
  }

  remove(id: string): void {
    if (!this.decks.some((d) => d.id === id)) return;
    this.change(() => {
      this.decks = this.decks.filter((d) => d.id !== id);
    });
  }

  /** Writes now if anything changed. */
  flush(): void {
    this.scheduled = false;
    if (!this.dirty || this.readOnly || !this.storage) return;
    this.dirty = false;
    this.writes++;
    const store: DeckStore = { format: DECK_STORE_FORMAT, decks: this.decks, deleted: [] };
    try {
      this.storage.setItem(DECKS_KEY, JSON.stringify(store));
    } catch {
      // full or blocked storage: the decks stay in memory for now
      this.dirty = true;
    }
  }

  /** The store as kept (test hook). */
  snapshot(): DeckStore {
    return { format: DECK_STORE_FORMAT, decks: this.decks.map((d) => ({ ...d, cards: { ...d.cards } })), deleted: [] };
  }

  private update(id: string, fn: (d: StoredDeck) => StoredDeck): void {
    const i = this.decks.findIndex((d) => d.id === id);
    if (i < 0) return;
    const old = this.decks[i]!;
    const next = fn(old);
    if (next === old) return;
    this.change(() => {
      this.decks[i] = { ...next, updatedAt: Math.max(this.now(), old.updatedAt) };
    });
  }

  private change(fn: () => void): void {
    if (this.readOnly) return;
    fn();
    this.dirty = true;
    if (!this.scheduled) {
      this.scheduled = true;
      this.schedule(() => this.flush());
    }
  }
}

function entry(d: StoredDeck): DeckEntry {
  return { id: d.id, side: d.side, name: d.name, identity: d.identity, cards: d.cards, standard: false, createdAt: d.createdAt, updatedAt: d.updatedAt };
}

/**
 * Reads the store. Broken data is copied to `.bak` and the list starts empty; a newer build's
 * store comes back as 'newer' (shown read-only).
 */
export function readDeckStore(storage: StoreLike | null): DeckStore | 'newer' {
  const empty: DeckStore = { format: DECK_STORE_FORMAT, decks: [], deleted: [] };
  let raw: string | null = null;
  try {
    raw = storage?.getItem(DECKS_KEY) ?? null;
  } catch {
    return empty;
  }
  if (raw === null) return empty;
  const parsed = parseDeckStore(raw);
  if (parsed === 'newer') return 'newer';
  if (parsed === 'broken') {
    try {
      storage?.setItem(DECKS_BAK_KEY, raw);
      storage?.removeItem(DECKS_KEY);
    } catch {
      // can't move it: leave it where it is (nothing is written over it until a change)
    }
    return empty;
  }
  return parsed;
}

/** A newer build's decks, read as far as this build understands them (shown only). */
function readNewerDecks(storage: StoreLike | null): StoredDeck[] {
  try {
    const raw = storage?.getItem(DECKS_KEY);
    const x = raw ? (JSON.parse(raw) as { decks?: unknown }) : null;
    if (!x || !Array.isArray(x.decks)) return [];
    const parsed = parseDeckStore({ format: DECK_STORE_FORMAT, decks: x.decks.filter((d) => parseDeckStore({ format: DECK_STORE_FORMAT, decks: [d] }) !== 'broken') });
    return parsed === 'broken' || parsed === 'newer' ? [] : [...parsed.decks];
  } catch {
    return [];
  }
}

/**
 * Sprint 13 (lead decision): New game after a pass-the-phone game with the player's own decks
 * opens the picker with the same decks picked. `decks` = the game's dealt lists (its options);
 * each side maps to the player's deck with that exact list, else the standard deck. Null for a
 * standard game (New game then starts today's game at once).
 */
export function picksOf(decks: Partial<Record<Side, DeckDef>> | undefined, library: DeckLibrary): Record<Side, string> | null {
  if (!decks || (!decks.corp && !decks.runner)) return null;
  const pick = (side: Side): string => {
    const dealt = decks[side];
    if (!dealt) return STANDARD_ID[side];
    return library.mine(side).find((d) => sameDeck(dealOf(d), dealt))?.id ?? STANDARD_ID[side];
  };
  return { corp: pick('corp'), runner: pick('runner') };
}

function sameDeck(a: DeckDef, b: DeckDef): boolean {
  return a.identity === b.identity && a.cards.length === b.cards.length && a.cards.every((id, i) => id === b.cards[i]);
}
