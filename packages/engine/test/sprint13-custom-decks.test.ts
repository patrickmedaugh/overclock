// Sprint 13 E3 (S-13-3 last AC, S-13-5): custom decks in a game. `GameOptions.decks` deals a side's
// own list; `newGame` refuses exactly what the editor refuses (deckStatus ≡ checkDeck ≡ newGame).
import {
  ALL_CARDS,
  IDENTITIES,
  STANDARD_DECKS,
  checkDeck,
  countsOf,
  deckFromCounts,
  deckPool,
  deckStatus,
  getCard,
  type CardDef,
  type DeckDef,
} from '@overclock/cards';
import { describe, expect, it } from 'vitest';
import { isPlayableDeck, newGame, replay, viewFor, type Action, type GameState, type Side } from '../src/index';

const SIDES: readonly Side[] = ['corp', 'runner'];
const other = (s: Side): Side => (s === 'corp' ? 'runner' : 'corp');
const sorted = (xs: readonly string[]) => [...xs].sort();
const dealt = (s: GameState, side: Side) => sorted([...s.players[side].deck, ...s.players[side].hand]);

/** Test-only seeded RNG (mulberry32), so the random decks are the same on every run. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random built deck: mostly small edits of a standard deck (many legal), sometimes wild ones. */
function randomDeck(r: () => number, side: Side): DeckDef {
  const pool: CardDef[] = deckPool(side).flatMap((g) => [...g.cards]);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
  if (r() < 0.15) {
    const all = ALL_CARDS.map((c) => c.id).concat(['zz1']);
    return { identity: r() < 0.85 ? IDENTITIES[side] : pick(['c13', 'r13', 'c01', 'zz']), cards: Array.from({ length: Math.floor(r() * 60) }, () => pick(all)) };
  }
  const cards = [...STANDARD_DECKS[side].cards];
  const edits = Math.floor(r() * 4);
  for (let i = 0; i < edits; i++) {
    const op = r();
    if (op < 0.4) {
      const at = Math.floor(r() * cards.length);
      cards[at] = pick(pool.filter((c) => c.type === getCard(cards[at]!)!.type)).id;
    } else if (op < 0.7) cards.push(pick(pool).id);
    else cards.splice(Math.floor(r() * cards.length), 1);
  }
  return deckFromCounts(IDENTITIES[side], countsOf({ identity: IDENTITIES[side], cards }));
}

function tryNewGame(seed: number, side: Side, deck: DeckDef): GameState | 'illegal_deck' {
  try {
    return newGame(seed, { decks: { [side]: deck } });
  } catch (e) {
    expect((e as Error).message).toBe('illegal_deck');
    return 'illegal_deck';
  }
}

describe('S-13-3: the editor and the game agree (deckStatus ≡ checkDeck ≡ newGame)', () => {
  it('on both standard decks', () => {
    for (const side of SIDES) {
      const deck = STANDARD_DECKS[side];
      expect(deckStatus(deck).legal).toBe(true);
      expect(checkDeck(deck)).toEqual([]);
      expect(isPlayableDeck(deck, side)).toBe(true);
      const s = tryNewGame(1, side, deck);
      expect(s).not.toBe('illegal_deck');
    }
  });

  it('on 300 random built decks; an accepted deck deals exactly its cards and identity', { timeout: 60_000 }, () => {
    const r = rng(2026_11_18);
    let legal = 0;
    for (let i = 0; i < 300; i++) {
      const side: Side = i % 2 === 0 ? 'corp' : 'runner';
      const deck = randomDeck(r, side);
      const ready = deckStatus(deck).legal;
      expect(ready, `deck ${i}`).toBe(checkDeck(deck).length === 0);
      expect(isPlayableDeck(deck, side), `deck ${i}`).toBe(ready && getCard(deck.identity)?.side === side);
      const s = tryNewGame(i, side, deck);
      expect(s !== 'illegal_deck', `deck ${i}: ${JSON.stringify(checkDeck(deck))}`).toBe(ready);
      if (s === 'illegal_deck') continue;
      legal++;
      expect(dealt(s, side)).toEqual(sorted(deck.cards));
      expect(s.players[side].identity).toBe(deck.identity);
      // The other side keeps the standard deck.
      expect(dealt(s, other(side))).toEqual(sorted(STANDARD_DECKS[other(side)].cards));
    }
    expect(legal).toBeGreaterThan(50);
    expect(300 - legal).toBeGreaterThan(50);
  });
});

describe('S-13-5: a custom deck is dealt', () => {
  it('a 46-card Corp deck: R&D + HQ are exactly those 46 ids (HQ 6 after the first draw, R&D 40)', () => {
    const deck = deckFromCounts('c13', { ...countsOf(STANDARD_DECKS.corp), c04: 3 }); // a 3rd Wall of Static
    expect(deck.cards).toHaveLength(46);
    expect(deckStatus(deck).legal).toBe(true);
    for (const seed of [1, 2, 99]) {
      const s = newGame(seed, { decks: { corp: deck } });
      expect(s.players.corp.hand).toHaveLength(6);
      expect(s.players.corp.deck).toHaveLength(40);
      expect(dealt(s, 'corp')).toEqual(sorted(deck.cards));
      expect(s.players.corp.identity).toBe('c13');
      expect(s.players.runner.deck.length + s.players.runner.hand.length).toBe(45);
    }
  });

  it('both sides custom at once; the shuffle is seeded (same seed + decks → same game, other seed → other order)', () => {
    const corp = deckFromCounts('c13', { ...countsOf(STANDARD_DECKS.corp), c04: 3 });
    const runner = deckFromCounts('r13', { ...countsOf(STANDARD_DECKS.runner), r08: 3 });
    const a = newGame(7, { decks: { corp, runner } });
    expect(JSON.stringify(newGame(7, { decks: { corp, runner } }))).toBe(JSON.stringify(a));
    expect(dealt(a, 'corp')).toEqual(sorted(corp.cards));
    expect(dealt(a, 'runner')).toEqual(sorted(runner.cards));
    expect(newGame(8, { decks: { corp, runner } }).players.corp.deck).not.toEqual(a.players.corp.deck);
  });

  it('a game with custom decks replays from (seed, options, actions)', () => {
    const corp = deckFromCounts('c13', { ...countsOf(STANDARD_DECKS.corp), c04: 3 });
    const actions: Action[] = [
      { type: 'gain_credit', player: 'corp' },
      { type: 'gain_credit', player: 'corp' },
      { type: 'gain_credit', player: 'corp' },
    ];
    const options = { decks: { corp } };
    const r = replay(3, actions, options);
    expect(r.events.some((e) => e.type === 'action_rejected')).toBe(false);
    expect(r.state.options.decks?.corp).toEqual(corp);
    expect(JSON.stringify(replay(3, actions, options).state)).toBe(JSON.stringify(r.state));
  });

  it('the options are copied: changing the caller\'s list later changes nothing', () => {
    const cards = [...deckFromCounts('c13', { ...countsOf(STANDARD_DECKS.corp), c04: 3 }).cards];
    const s = newGame(5, { decks: { corp: { identity: 'c13', cards } } });
    const before = JSON.stringify(s);
    cards.length = 0;
    expect(JSON.stringify(s)).toBe(before);
    expect(s.options.decks?.corp?.cards).toHaveLength(46);
  });

  it('neither view carries the deck lists (the other side never sees your list)', () => {
    const runner = deckFromCounts('r13', { ...countsOf(STANDARD_DECKS.runner), r08: 3 });
    const s = newGame(4, { decks: { runner } });
    for (const side of SIDES) expect(JSON.stringify(viewFor(side, s))).not.toContain('"decks"');
  });
});

describe('S-13-5: newGame refuses illegal decks (Error illegal_deck)', () => {
  const corp45 = STANDARD_DECKS.corp;
  const bad: [string, Partial<Record<Side, DeckDef>>][] = [
    ['44 cards', { corp: { identity: 'c13', cards: corp45.cards.slice(1) } }],
    ['a 4th copy', { corp: { identity: 'c13', cards: corp45.cards.map((id, i) => (i === corp45.cards.indexOf('c04') ? 'c01' : id)) } }],
    ['an unknown id', { corp: { identity: 'c13', cards: [...corp45.cards, 'zz9'] } }],
    ['a Weyland agenda for Haas-Bioroid', { corp: { identity: 'c13', cards: [...corp45.cards.filter((id) => id !== 'c09'), 'c08', 'c08'] } }],
    ['the Runner deck as the Corp', { corp: STANDARD_DECKS.runner }],
    ['the Corp deck as the Runner', { runner: STANDARD_DECKS.corp }],
    ['no identity card', { runner: { identity: 'r01', cards: STANDARD_DECKS.runner.cards } }],
    ['influence 17 / 15', { runner: { identity: 'r13', cards: [...STANDARD_DECKS.runner.cards.filter((id) => id !== 'r14'), 'r06', 'r06', 'r06'] } }],
    ['malformed', { runner: { identity: 'r13', cards: 'r01' } as unknown as DeckDef }],
  ];
  it.each(bad)('%s', (_name, decks) => {
    expect(() => newGame(1, { decks })).toThrow('illegal_deck');
  });
});

describe('S-13-5: standard picks are byte-identical to Sprint 12', () => {
  it('no decks / decks {} / decks undefined → same state, no "decks" key in the options', () => {
    for (const seed of [1, 42, 1117]) {
      const base = JSON.stringify(newGame(seed));
      expect(JSON.stringify(newGame(seed, { deckSet: 'core45' }))).toBe(base);
      expect(JSON.stringify(newGame(seed, { decks: {} }))).toBe(base);
      expect(JSON.stringify(newGame(seed, { decks: undefined }))).toBe(base);
      expect(JSON.stringify(newGame(seed, { decks: { corp: undefined } }))).toBe(base);
      expect('decks' in newGame(seed).options).toBe(false);
    }
  });

  it('passing a standard deck explicitly deals the same cards as the standard game (only the options differ)', () => {
    const plain = newGame(9);
    const explicit = newGame(9, { decks: { corp: STANDARD_DECKS.corp, runner: STANDARD_DECKS.runner } });
    expect(explicit.players).toEqual(plain.players);
    expect(explicit.rng).toBe(plain.rng);
    expect(explicit.options.decks).toEqual({ corp: STANDARD_DECKS.corp, runner: STANDARD_DECKS.runner });
  });

  it('deckSet still picks the deck of a side not given (core 30 Corp + custom Runner)', () => {
    const runner = deckFromCounts('r13', { ...countsOf(STANDARD_DECKS.runner), r08: 3 });
    const s = newGame(2, { deckSet: 'core', decks: { runner } });
    expect(s.players.corp.deck.length + s.players.corp.hand.length).toBe(30);
    expect(dealt(s, 'runner')).toEqual(sorted(runner.cards));
  });
});
