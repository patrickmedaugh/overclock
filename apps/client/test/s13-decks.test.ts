// Sprint 13 (U1-U4): the deck builder's words (`deckText.ts`) and the deck store I/O
// (`deckStore.ts`). Rules come from `@overclock/cards`; these tests only check the words and the
// storage round trip.
import { STANDARD_DECKS, addBlock, countsOf, deckFromCounts, deckStatus } from '@overclock/cards';
import { parseDeckStore } from '@overclock/match';
import { describe, expect, it } from 'vitest';
import { DECKS_BAK_KEY, DECKS_KEY, DeckLibrary, STANDARD_ID, dealOf, picksOf } from '../src/deckStore';
import { DECK_TEXT, addBlockText, agendaText, barFlags, deckNote, influenceText, newDeckName, problemsText, sizeText, standardDeckName } from '../src/deckText';

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

const HB = STANDARD_DECKS.corp.identity;
const corpCounts = () => ({ ...countsOf(STANDARD_DECKS.corp) });

describe('deckText (S-13-3 words)', () => {
  it('standard deck names', () => {
    expect(standardDeckName('corp', STANDARD_DECKS.corp.identity)).toBe('Standard Corp deck (Haas-Bioroid)');
    expect(standardDeckName('runner', STANDARD_DECKS.runner.identity)).toBe('Standard Runner deck (Kate)');
  });

  it('new deck names take the first free number', () => {
    expect(newDeckName('corp', [])).toBe('My Corp deck 1');
    expect(newDeckName('runner', ['My Runner deck 1', 'My Runner deck 3'])).toBe('My Runner deck 2');
  });

  it('the standard Corp deck: green bar, Ready to play', () => {
    const s = deckStatus(STANDARD_DECKS.corp);
    expect(sizeText(s)).toBe('45 / 45 cards');
    expect(influenceText(s)).toBe('Influence 8 / 15');
    expect(agendaText(s)).toBe('Agenda points 21 (needs 20–21)');
    expect(barFlags(s)).toEqual({ size: false, influence: false, agenda: false });
    expect(deckNote(s, HB)).toEqual({ ready: true, text: 'Ready to play' });
  });

  it('41 cards with 18 points: red count and points, "4 cards short"', () => {
    const c = corpCounts();
    c['c10'] = (c['c10'] ?? 0) - 1; // Priority Requisition: -3 points
    c['c01'] = (c['c01'] ?? 0) - 3; // Hedge Fund
    const s = deckStatus(deckFromCounts(HB, c));
    expect(sizeText(s)).toBe('41 / 45 cards');
    expect(agendaText(s)).toBe('Agenda points 18 (needs 18–19)');
    // 41 cards needs 18-19, so only the count is red here.
    expect(barFlags(s)).toEqual({ size: true, influence: false, agenda: false });
    expect(deckNote(s, HB)).toEqual({ ready: false, text: '4 cards short' });
  });

  it('17 influence: "Influence 17 / 15" and "2 influence over the limit"', () => {
    // Standard Runner deck (10) + 2 Ninja (criminal, 2 each) + 1 Cyberfeeder (anarch, 1) + 2 Easy Mark (criminal, 1 each).
    const c = { ...countsOf(STANDARD_DECKS.runner), r06: 2, r08: 3, r01: 3 };
    const s = deckStatus(deckFromCounts(STANDARD_DECKS.runner.identity, c));
    expect(influenceText(s)).toBe('Influence 17 / 15');
    expect(agendaText(s)).toBeNull();
    expect(barFlags(s)).toEqual({ size: false, influence: true, agenda: false });
    expect(problemsText(s, STANDARD_DECKS.runner.identity)).toEqual(['2 influence over the limit']);
    // Influence never dims a +.
    expect(addBlock(deckFromCounts(STANDARD_DECKS.runner.identity, c), 'r06')).toBeNull();
  });

  it('dimmed + reasons', () => {
    expect(addBlockText({ kind: 'max_copies', limit: 3 })).toBe('Max 3 copies');
    expect(addBlockText({ kind: 'agenda_faction', identityFaction: 'haas_bioroid', cardFaction: 'weyland' })).toBe("Haas-Bioroid can't use Weyland agendas");
    // From the real rule check: Hostile Takeover (Weyland) in an HB deck; a 4th Hedge Fund.
    const b = addBlock(STANDARD_DECKS.corp, 'c08');
    expect(b && addBlockText(b)).toBe("Haas-Bioroid can't use Weyland agendas");
    const three = deckFromCounts(HB, { c01: 3 });
    const m = addBlock(three, 'c01');
    expect(m && addBlockText(m)).toBe('Max 3 copies');
  });

  it('online note wording', () => {
    expect(DECK_TEXT.onlineStandard).toBe('Online games use the standard decks for now.');
  });
});

describe('DeckLibrary (S-13-4 kept on the device)', () => {
  const sync = { schedule: (fn: () => void) => (fn(), 1), now: () => 1000, newId: (() => { let n = 0; return () => `id-${++n}`; })() };

  it('standard decks are never stored and read only', () => {
    const store = new MemStore();
    const lib = new DeckLibrary(store, sync);
    expect(lib.get(STANDARD_ID.corp)?.standard).toBe(true);
    expect(dealOf(lib.standard('corp'))).toEqual(deckFromCounts(HB, countsOf(STANDARD_DECKS.corp)));
    expect(store.getItem(DECKS_KEY)).toBeNull();
  });

  it('create, change, rename, delete: each kept at once, and read back by a new library', () => {
    const store = new MemStore();
    const lib = new DeckLibrary(store, sync);
    const d = lib.create('corp', lib.standard('corp').cards);
    expect(d.name).toBe('My Corp deck 1');
    lib.setCount(d.id, 'c01', 2);
    lib.rename(d.id, '  Glacier  ');
    const e = lib.create('corp', null);
    expect(e.name).toBe('My Corp deck 1'); // "1" is free again after the rename
    const again = new DeckLibrary(store, sync);
    const mine = again.mine('corp');
    expect(mine.map((x) => x.name)).toEqual(['Glacier', 'My Corp deck 1']);
    expect(mine[0]!.cards['c01']).toBe(2);
    expect(mine[1]!.cards).toEqual({});
    expect(parseDeckStore(store.getItem(DECKS_KEY))).not.toBe('broken');
    again.remove(mine[0]!.id);
    expect(new DeckLibrary(store, sync).mine('corp').map((x) => x.name)).toEqual(['My Corp deck 1']);
  });

  it('writes wait for the scheduled moment; flush writes now', () => {
    const store = new MemStore();
    const queued: (() => void)[] = [];
    const lib = new DeckLibrary(store, { schedule: (fn) => queued.push(fn) });
    const d = lib.create('runner', null);
    lib.setCount(d.id, 'r01', 1);
    expect(store.getItem(DECKS_KEY)).toBeNull();
    expect(queued.length).toBe(1);
    lib.flush();
    expect(JSON.parse(store.getItem(DECKS_KEY)!).decks[0].cards).toEqual({ r01: 1 });
  });

  it('broken data goes to .bak and the list starts empty', () => {
    const store = new MemStore();
    store.setItem(DECKS_KEY, '{"format":1,"decks":[{"oops":');
    const lib = new DeckLibrary(store, sync);
    expect(lib.mine('corp')).toEqual([]);
    expect(store.getItem(DECKS_BAK_KEY)).toBe('{"format":1,"decks":[{"oops":');
  });

  it("a newer build's store is shown read only and never written", () => {
    const store = new MemStore();
    const raw = JSON.stringify({ format: 99, decks: [] });
    store.setItem(DECKS_KEY, raw);
    const lib = new DeckLibrary(store, sync);
    expect(lib.readOnly).toBe(true);
    lib.create('corp', null);
    lib.flush();
    expect(store.getItem(DECKS_KEY)).toBe(raw);
  });

  it('blocked storage never throws', () => {
    const bad = {
      getItem(): string | null {
        throw new Error('blocked');
      },
      setItem(): void {
        throw new Error('full');
      },
      removeItem(): void {
        throw new Error('blocked');
      },
    };
    const lib = new DeckLibrary(bad, sync);
    expect(() => lib.setCount(lib.create('corp', null).id, 'c01', 1)).not.toThrow();
  });
});

describe('New game after a game with own decks (lead decision)', () => {
  it('picks the same decks again; standard games start at once; a changed deck falls back to standard', () => {
    const lib = new DeckLibrary(new MemStore(), { schedule: (fn) => (fn(), 0) });
    const corp = lib.create('corp', { ...countsOf(STANDARD_DECKS.corp), c06: 3 });
    const other = lib.create('corp', null);
    expect(other.id).not.toBe(corp.id);
    expect(picksOf(undefined, lib)).toBeNull();
    expect(picksOf({}, lib)).toBeNull();
    expect(picksOf({ corp: dealOf(corp) }, lib)).toEqual({ corp: corp.id, runner: STANDARD_ID.runner });
    lib.setCount(corp.id, 'c06', 2);
    expect(picksOf({ corp: dealOf({ identity: corp.identity, cards: { ...corp.cards } }) }, lib)).toEqual({ corp: STANDARD_ID.corp, runner: STANDARD_ID.runner });
  });
});
