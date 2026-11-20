// Sprint 13 E2 (S-13-2, S-13-3): the deck builder helpers, all built on `checkDeck`.
// The three-way agreement with `newGame` (the game refuses what the editor refuses) lives in
// packages/engine/test/sprint13-custom-decks.test.ts (the engine depends on this package, not back).
import { describe, expect, it } from 'vitest';
import {
  ALL_CARDS,
  CORP_CORE45_DECK,
  MAX_COPIES,
  RUNNER_CORE45_DECK,
  STANDARD_DECKS,
  IDENTITIES,
  addBlock,
  checkDeck,
  countsOf,
  deckAgendaPoints,
  deckFromCounts,
  deckInfluence,
  deckPool,
  deckStatus,
  getCard,
  type CardDef,
  type DeckDef,
  type Side,
} from '../src/index';

const SIDES: readonly Side[] = ['corp', 'runner'];
const poolIds = (side: Side) => deckPool(side).flatMap((g) => g.cards.map((c) => c.id));
const plus = (deck: DeckDef, ...ids: string[]): DeckDef => ({ identity: deck.identity, cards: [...deck.cards, ...ids] });
const minus = (deck: DeckDef, id: string): DeckDef => {
  const i = deck.cards.indexOf(id);
  return { identity: deck.identity, cards: deck.cards.filter((_, j) => j !== i) };
};

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

describe('S-13-2: deckPool (the editor list)', () => {
  it('Corp 24 cards, Runner 20: every non-identity card of the side, each once', () => {
    for (const side of SIDES) {
      const want = ALL_CARDS.filter((c) => c.side === side && c.type !== 'identity').map((c) => c.id);
      expect(poolIds(side)).toHaveLength(side === 'corp' ? 24 : 20);
      expect([...poolIds(side)].sort()).toEqual([...want].sort());
    }
  });

  it('groups in AC order (Corp agenda, ICE, asset, upgrade, operation; Runner event, hardware, resource, program), by name inside a group', () => {
    expect(deckPool('corp').map((g) => g.type)).toEqual(['agenda', 'ice', 'asset', 'upgrade', 'operation']);
    expect(deckPool('runner').map((g) => g.type)).toEqual(['event', 'hardware', 'resource', 'program']);
    for (const side of SIDES) {
      for (const g of deckPool(side)) {
        expect(g.cards.length).toBeGreaterThan(0);
        expect(g.cards.every((c) => c.type === g.type)).toBe(true);
        const names = g.cards.map((c) => c.name);
        expect(names).toEqual([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
      }
    }
    expect(deckPool('corp')[0]!.cards.map((c) => c.name)).toEqual(['Accelerated Beta Test', 'Hostile Takeover', 'Priority Requisition', 'Private Security Force']);
  });

  it('is pure: calling it twice gives equal lists and does not touch the card data', () => {
    expect(deckPool('corp')).toEqual(deckPool('corp'));
    expect(ALL_CARDS[0]!.id).toBe('r01'); // canonical order unchanged by the sort
  });
});

describe('S-13-3: standard decks and identities', () => {
  it('IDENTITIES = Haas-Bioroid and Kate; STANDARD_DECKS = the 45-card core45 decks', () => {
    expect(IDENTITIES).toEqual({ corp: 'c13', runner: 'r13' });
    expect(STANDARD_DECKS.corp).toBe(CORP_CORE45_DECK);
    expect(STANDARD_DECKS.runner).toBe(RUNNER_CORE45_DECK);
  });

  it('both standard decks are Ready: deckStatus legal, no problems, numbers on the bar', () => {
    const corp = deckStatus(STANDARD_DECKS.corp);
    expect(corp).toEqual({
      size: 45,
      minSize: 45,
      influence: deckInfluence(STANDARD_DECKS.corp),
      influenceLimit: 15,
      agendaPoints: 21,
      agendaRange: { min: 20, max: 21 },
      problems: [],
      legal: true,
    });
    const runner = deckStatus(STANDARD_DECKS.runner);
    expect(runner).toMatchObject({ size: 45, minSize: 45, influenceLimit: 15, agendaRange: null, problems: [], legal: true });
    expect(runner.influence).toBe(deckInfluence(STANDARD_DECKS.runner));
    expect(runner.agendaPoints).toBe(0);
  });

  it('a standard deck rebuilt from its counts (what "Start from the standard deck" stores) is still Ready', () => {
    for (const side of SIDES) {
      const d = deckFromCounts(IDENTITIES[side], countsOf(STANDARD_DECKS[side]));
      expect(deckStatus(d).legal, side).toBe(true);
      expect([...d.cards].sort()).toEqual([...STANDARD_DECKS[side].cards].sort());
    }
  });
});

describe('S-13-3: deckStatus (the editor bar)', () => {
  it('an empty deck: 0 / 45, short, agenda range 2–3 for 0 cards', () => {
    const s = deckStatus({ identity: 'c13', cards: [] });
    expect(s).toMatchObject({ size: 0, minSize: 45, influence: 0, influenceLimit: 15, agendaPoints: 0, agendaRange: { min: 2, max: 3 }, legal: false });
    expect(s.problems).toContainEqual({ kind: 'too_small', size: 0, min: 45 });
    expect(deckStatus({ identity: 'r13', cards: [] }).problems).toEqual([{ kind: 'too_small', size: 0, min: 45 }]);
  });

  it('a 46-card Corp deck needs 20–21 points (a legal 46); 50 cards needs 22–23', () => {
    const d46 = plus(STANDARD_DECKS.corp, 'c04'); // a 3rd Wall of Static
    expect(deckStatus(d46)).toMatchObject({ size: 46, agendaPoints: 21, agendaRange: { min: 20, max: 21 }, problems: [], legal: true });
    const d50: DeckDef = { identity: 'c13', cards: Array.from({ length: 50 }, () => 'c04') };
    expect(deckStatus(d50).agendaRange).toEqual({ min: 22, max: 23 });
  });

  it('the bar counts influence over the limit (17 / 15) and agenda points out of range', () => {
    // Runner: 3 Sure Gamble (neutral, 0) out, 3 Ninja (Criminal, 2 each) in: +6 influence.
    let d: DeckDef = STANDARD_DECKS.runner;
    const before = deckInfluence(d);
    for (let i = 0; i < 3; i++) d = plus(minus(d, 'r14'), 'r06');
    const s = deckStatus(d);
    expect(s.size).toBe(45);
    expect(s.influence).toBe(before + 6);
    expect(s.influence).toBeGreaterThan(15);
    expect(s.problems).toEqual([{ kind: 'influence', used: before + 6, limit: 15 }]);
    expect(s.legal).toBe(false);
    const shortDeck = minus(minus(STANDARD_DECKS.corp, 'c10'), 'c09'); // 43 cards, 21 − 3 − 2 = 16 points
    const short = deckStatus(shortDeck);
    expect(short.problems).toEqual([
      { kind: 'too_small', size: 43, min: 45 },
      { kind: 'agenda_points', points: 16, min: 18, max: 19 },
    ]);
    expect(short.agendaPoints).toBe(deckAgendaPoints(shortDeck));
  });

  it('an unknown identity: minSize 0, limit 0, no agenda range, not legal', () => {
    const s = deckStatus({ identity: 'zz', cards: ['c01'] });
    expect(s).toMatchObject({ minSize: 0, influenceLimit: 0, agendaRange: null, legal: false });
    expect(s.problems).toContainEqual({ kind: 'unknown_card', cardId: 'zz' });
  });
});

describe('S-13-3: addBlock (why a + is dimmed)', () => {
  it('Max 3: the 4th copy of any card is blocked, the 3rd is not', () => {
    for (const side of SIDES) {
      for (const id of poolIds(side)) {
        const two: DeckDef = { identity: IDENTITIES[side], cards: [id, id] };
        const three = plus(two, id);
        const c = getCard(id)!;
        const offAgenda = c.type === 'agenda' && c.faction !== 'neutral' && c.faction !== getCard(IDENTITIES[side])!.faction;
        if (!offAgenda) expect(addBlock(two, id), id).toBeNull();
        expect(addBlock(three, id), id).toEqual(offAgenda ? expect.anything() : { kind: 'max_copies', limit: MAX_COPIES });
      }
    }
    expect(MAX_COPIES).toBe(3);
    expect(addBlock(STANDARD_DECKS.corp, 'c01')).toEqual({ kind: 'max_copies', limit: 3 }); // standard has 3 Hedge Fund
  });

  it('Hostile Takeover (Weyland agenda) is blocked for Haas-Bioroid, even in an empty deck', () => {
    expect(getCard('c08')).toMatchObject({ name: 'Hostile Takeover', type: 'agenda', faction: 'weyland' });
    const block = { kind: 'agenda_faction', identityFaction: 'haas_bioroid', cardFaction: 'weyland' };
    expect(addBlock({ identity: 'c13', cards: [] }, 'c08')).toEqual(block);
    expect(addBlock(STANDARD_DECKS.corp, 'c08')).toEqual(block);
  });

  it('neutral and Haas-Bioroid agendas are never faction-blocked', () => {
    for (const id of ['c09', 'c10', 'c23']) expect(addBlock({ identity: 'c13', cards: [] }, id), id).toBeNull();
  });

  it('influence never blocks: a + that takes the deck to 17 / 15 stays allowed (the bar goes red instead)', () => {
    // Corp: Neural Katana and Neural EMP (Jinteki, 2 each) and Akitaro Watanabe (Jinteki, 2).
    let d: DeckDef = { identity: 'c13', cards: [] };
    for (const id of ['c07', 'c07', 'c07', 'c12', 'c12', 'c12', 'c11']) {
      expect(addBlock(d, id), `${id} at ${deckInfluence(d)}`).toBeNull();
      d = plus(d, id);
    }
    // 3×2 + 3×2 + 2 = 14; then SEA Source (NBN, 2) → 16, Anonymous Tip (NBN, 1) → 17.
    expect(deckInfluence(d)).toBe(14);
    expect(addBlock(d, 'c22')).toBeNull();
    d = plus(d, 'c22');
    expect(addBlock(d, 'c02')).toBeNull();
    d = plus(d, 'c02');
    expect(deckInfluence(d)).toBe(17);
    expect(deckStatus(d).influence).toBe(17);
    expect(deckStatus(d).problems).toContainEqual({ kind: 'influence', used: 17, limit: 15 });
    expect(addBlock(d, 'c05')).toBeNull(); // still more allowed (Ice Wall, Weyland 1)
  });

  it('agenda points never block: going over the range only shows on the bar', () => {
    const d: DeckDef = { identity: 'c13', cards: ['c10', 'c10', 'c09', 'c09', 'c09'] };
    expect(deckAgendaPoints(d)).toBe(12);
    expect(addBlock(d, 'c10')).toBeNull();
    expect(deckStatus(plus(d, 'c10')).problems).toContainEqual(expect.objectContaining({ kind: 'agenda_points' }));
  });

  it('wrong side, unknown ids and identities are blocked', () => {
    expect(addBlock({ identity: 'c13', cards: [] }, 'r01')).toEqual({ kind: 'wrong_side' });
    expect(addBlock({ identity: 'r13', cards: [] }, 'c01')).toEqual({ kind: 'wrong_side' });
    expect(addBlock({ identity: 'c13', cards: [] }, 'zz9')).toEqual({ kind: 'unknown_card' });
    expect(addBlock({ identity: 'c13', cards: [] }, 'c13')).toEqual({ kind: 'unknown_card' });
    expect(addBlock({ identity: 'r13', cards: [] }, 'r13')).toEqual({ kind: 'unknown_card' });
  });

  it('blocks only on the card itself: a deck with other problems still allows a clean +', () => {
    const broken: DeckDef = { identity: 'c13', cards: ['c01', 'c01', 'c01', 'c01', 'zz', 'r01'] };
    expect(addBlock(broken, 'c03')).toBeNull();
    expect(addBlock(broken, 'c01')).toEqual({ kind: 'max_copies', limit: 3 });
  });
});

describe('S-13-4: countsOf / deckFromCounts (stored decks are copy counts)', () => {
  it('round trip: same cards, canonical order (ALL_CARDS order, copies adjacent)', () => {
    for (const side of SIDES) {
      const deck = STANDARD_DECKS[side];
      const counts = countsOf(deck);
      expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(45);
      expect(counts[deck.identity]).toBeUndefined();
      const d = deckFromCounts(deck.identity, counts);
      expect(d.identity).toBe(deck.identity);
      expect([...d.cards].sort()).toEqual([...deck.cards].sort());
      const order = ALL_CARDS.map((c) => c.id);
      const idx = d.cards.map((id) => order.indexOf(id));
      expect(idx).toEqual([...idx].sort((a, b) => a - b));
      expect(countsOf(d)).toEqual(counts);
    }
  });

  it('the same counts in any key order give the same list (a deck always deals the same for a seed)', () => {
    const a = deckFromCounts('c13', { c10: 3, c01: 2, c04: 1 });
    const b = deckFromCounts('c13', { c04: 1, c01: 2, c10: 3 });
    expect(a).toEqual(b);
    expect(a.cards).toEqual(['c01', 'c01', 'c04', 'c10', 'c10', 'c10']);
  });

  it('drops counts below 1, floors fractions, keeps unknown ids at the end (sorted) so checkDeck reports them', () => {
    const d = deckFromCounts('c13', { zz2: 1, c01: 2.7, c03: 0, c04: -1, zz1: 2 });
    expect(d.cards).toEqual(['c01', 'c01', 'zz1', 'zz1', 'zz2']);
    expect(checkDeck(d)).toContainEqual({ kind: 'unknown_card', cardId: 'zz1' });
    expect(deckStatus(d).legal).toBe(false);
  });

  it('countsOf on an empty deck is {}', () => {
    expect(countsOf({ identity: 'r13', cards: [] })).toEqual({});
  });
});

/** A random deck: mostly near-legal edits of a standard deck, sometimes wild. Returns counts-built decks too. */
function randomDeck(r: () => number): DeckDef {
  const side: Side = r() < 0.5 ? 'corp' : 'runner';
  const pool: CardDef[] = deckPool(side).flatMap((g) => [...g.cards]);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
  const mode = r();
  if (mode < 0.15) {
    // Wild: any ids, any counts.
    const all = ALL_CARDS.map((c) => c.id).concat(['zz1']);
    const n = Math.floor(r() * 60);
    return { identity: r() < 0.9 ? IDENTITIES[side] : pick(['c13', 'r13', 'c01', 'zz']), cards: Array.from({ length: n }, () => pick(all)) };
  }
  let cards = [...STANDARD_DECKS[side].cards];
  const edits = Math.floor(r() * 4);
  for (let i = 0; i < edits; i++) {
    const op = r();
    if (op < 0.4 && cards.length > 0) {
      // Swap one card for another of the same type (keeps agenda points when both are non-agendas).
      const at = Math.floor(r() * cards.length);
      const out = getCard(cards[at]!)!;
      const same = pool.filter((c) => c.type === out.type);
      cards[at] = pick(same).id;
    } else if (op < 0.7) cards.push(pick(pool).id);
    else if (cards.length > 0) cards.splice(Math.floor(r() * cards.length), 1);
  }
  if (r() < 0.5) return deckFromCounts(IDENTITIES[side], countsOf({ identity: IDENTITIES[side], cards }));
  cards = cards.sort(() => r() - 0.5);
  return { identity: IDENTITIES[side], cards };
}

describe('S-13-3: one rule check (deckStatus ≡ checkDeck) on 300 random decks', () => {
  it('deckStatus().legal === (checkDeck().length === 0), problems === checkDeck, and the bar numbers match', () => {
    const r = rng(1313);
    let legal = 0;
    for (let i = 0; i < 300; i++) {
      const deck = randomDeck(r);
      const s = deckStatus(deck);
      const problems = checkDeck(deck);
      expect(s.problems, `deck ${i}`).toEqual(problems);
      expect(s.legal, `deck ${i}`).toBe(problems.length === 0);
      expect(s.size).toBe(deck.cards.length);
      expect(s.influence).toBe(deckInfluence(deck));
      expect(s.agendaPoints).toBe(deckAgendaPoints(deck));
      if (s.legal) legal++;
      // addBlock against an independent reading of the two blocking rules, for every pool card.
      const id = getCard(deck.identity);
      if (id?.type !== 'identity') continue;
      const have = countsOf(deck);
      for (const c of deckPool(id.side).flatMap((g) => g.cards)) {
        const want =
          c.type === 'agenda' && c.faction !== 'neutral' && c.faction !== id.faction
            ? { kind: 'agenda_faction', identityFaction: id.faction, cardFaction: c.faction }
            : (have[c.id] ?? 0) >= MAX_COPIES
              ? { kind: 'max_copies', limit: MAX_COPIES }
              : null;
        const got = addBlock(deck, c.id);
        // When both rules apply the agenda one or the copies one may come first; both are blocks.
        if (want?.kind === 'agenda_faction' && (have[c.id] ?? 0) >= MAX_COPIES) expect(got).not.toBeNull();
        else expect(got, `${i} ${c.id}`).toEqual(want);
      }
    }
    // The mix covers both answers well.
    expect(legal).toBeGreaterThan(40);
    expect(300 - legal).toBeGreaterThan(40);
  });
});
