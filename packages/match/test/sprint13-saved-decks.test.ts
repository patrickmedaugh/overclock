// Sprint 13 E4 (S-13-4): the on-device deck store format (`localStorage['overclock.decks.v1']`).
// The client only does the I/O; this file pins the shape every reader (today's client, a later
// online service) agrees on.
import { IDENTITIES, STANDARD_DECKS, countsOf, deckFromCounts, deckStatus } from '@overclock/cards';
import { describe, expect, it } from 'vitest';
import { DECK_STORE_FORMAT, MAX_STORED_COPIES, parseDeckStore, type DeckStore, type StoredDeck } from '../src/index';

const T = 1_763_490_000_000;
const corpDeck: StoredDeck = {
  id: '0b6f8a52-6a0e-4d4f-9c1b-0d3f0f6c1a11',
  side: 'corp',
  name: 'My Corp deck 1',
  identity: IDENTITIES.corp,
  cards: countsOf(STANDARD_DECKS.corp),
  createdAt: T,
  updatedAt: T + 5000,
};
const runnerDeck: StoredDeck = { id: 'b2', side: 'runner', name: 'Empty Kate', identity: IDENTITIES.runner, cards: {}, createdAt: T, updatedAt: T };
const store: DeckStore = { format: 1, decks: [corpDeck, runnerDeck] };

describe('S-13-4: deck store format 1', () => {
  it('DECK_STORE_FORMAT is 1', () => {
    expect(DECK_STORE_FORMAT).toBe(1);
  });

  it('round trip through JSON (what closing and reopening the browser does)', () => {
    expect(parseDeckStore(JSON.stringify(store))).toEqual(store);
    expect(parseDeckStore(store)).toEqual(store);
    expect(parseDeckStore({ format: 1, decks: [] })).toEqual({ format: 1, decks: [] });
  });

  it('returns a detached copy', () => {
    const input = JSON.parse(JSON.stringify(store)) as { decks: { cards: Record<string, number>; name: string }[] };
    const p = parseDeckStore(input);
    if (p === 'broken' || p === 'newer') throw new Error(p);
    input.decks[0]!.cards.c01 = 0;
    input.decks[0]!.name = 'changed';
    expect(p.decks[0]!.cards.c01).toBe(3);
    expect(p.decks[0]!.name).toBe('My Corp deck 1');
  });

  it('a stored deck deals through deckFromCounts and is Ready exactly when deckStatus says so', () => {
    const p = parseDeckStore(JSON.stringify(store)) as DeckStore;
    expect(deckStatus(deckFromCounts(p.decks[0]!.identity, p.decks[0]!.cards)).legal).toBe(true);
    expect(deckStatus(deckFromCounts(p.decks[1]!.identity, p.decks[1]!.cards)).legal).toBe(false);
  });

  it('unknown card ids and over-limit counts are kept (the deck just is not Ready); 0 counts are dropped; extra fields dropped', () => {
    const odd = { ...corpDeck, cards: { ...corpDeck.cards, zz9: 2, c01: 4, c03: 0 }, colour: 'red' };
    const p = parseDeckStore({ format: 1, decks: [odd], extra: true });
    if (p === 'broken' || p === 'newer') throw new Error(p);
    const kept: Record<string, number> = { ...corpDeck.cards, zz9: 2, c01: 4 };
    delete kept.c03;
    expect(p).toEqual({ format: 1, decks: [{ ...corpDeck, cards: kept }] });
    expect('c03' in p.decks[0]!.cards).toBe(false);
    expect('colour' in p.decks[0]!).toBe(false);
    const s = deckStatus(deckFromCounts(p.decks[0]!.identity, p.decks[0]!.cards));
    expect(s.legal).toBe(false);
    expect(s.problems).toContainEqual({ kind: 'unknown_card', cardId: 'zz9' });
    expect(s.problems).toContainEqual({ kind: 'too_many_copies', cardId: 'c01', copies: 4 });
  });

  it('a deck whose identity is the other side\'s is kept (not Ready, not broken)', () => {
    const p = parseDeckStore({ format: 1, decks: [{ ...runnerDeck, identity: 'c13' }] });
    expect(p).not.toBe('broken');
  });

  it('two decks with the same id: the newest updatedAt is kept, in the first one\'s place', () => {
    const older = { ...corpDeck, name: 'old', updatedAt: T };
    const newer = { ...corpDeck, name: 'new', updatedAt: T + 9 };
    expect((parseDeckStore({ format: 1, decks: [older, runnerDeck, newer] }) as DeckStore).decks.map((d) => d.name)).toEqual(['new', 'Empty Kate']);
    expect((parseDeckStore({ format: 1, decks: [newer, runnerDeck, older] }) as DeckStore).decks.map((d) => d.name)).toEqual(['new', 'Empty Kate']);
    expect((parseDeckStore({ format: 1, decks: [older, { ...older, name: 'tie' }] }) as DeckStore).decks.map((d) => d.name)).toEqual(['old']);
  });

  it('newer: a later build\'s format (shown read-only, never overwritten)', () => {
    expect(parseDeckStore({ format: 2, decks: 'anything' })).toBe('newer');
    expect(parseDeckStore(JSON.stringify({ format: 7 }))).toBe('newer');
  });

  it('broken: not JSON, not a store, or a deck with a bad field', () => {
    const bad: unknown[] = [
      undefined,
      null,
      42,
      '',
      '{not json',
      'null',
      '[]',
      [],
      {},
      { format: 0, decks: [] },
      { format: '1', decks: [] },
      { format: 1.5, decks: [] },
      { format: 1 },
      { format: 1, decks: {} },
      { format: 1, decks: [null] },
      { format: 1, decks: [{ ...corpDeck, id: '' }] },
      { format: 1, decks: [{ ...corpDeck, id: 5 }] },
      { format: 1, decks: [{ ...corpDeck, side: 'both' }] },
      { format: 1, decks: [{ ...corpDeck, name: undefined }] },
      { format: 1, decks: [{ ...corpDeck, identity: null }] },
      { format: 1, decks: [{ ...corpDeck, cards: ['c01'] }] },
      { format: 1, decks: [{ ...corpDeck, cards: { c01: -1 } }] },
      { format: 1, decks: [{ ...corpDeck, cards: { c01: 1.5 } }] },
      { format: 1, decks: [{ ...corpDeck, cards: { c01: '3' } }] },
      { format: 1, decks: [{ ...corpDeck, cards: { c01: MAX_STORED_COPIES + 1 } }] },
      { format: 1, decks: [{ ...corpDeck, createdAt: -1 }] },
      { format: 1, decks: [{ ...corpDeck, updatedAt: 'today' }] },
      { format: 1, decks: [corpDeck, { ...runnerDeck, createdAt: undefined }] },
    ];
    for (const x of bad) expect(parseDeckStore(x), JSON.stringify(x) ?? String(x)).toBe('broken');
  });

  it(`a count of ${MAX_STORED_COPIES} is the cap (kept); real decks never come near it`, () => {
    expect(parseDeckStore({ format: 1, decks: [{ ...corpDeck, cards: { c01: MAX_STORED_COPIES } }] })).not.toBe('broken');
  });
});
