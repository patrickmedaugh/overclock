// QA Sprint 13 (independent checks, written by QA): the deck builder's rule helpers and custom decks
// in a game. S-13-2 (pool), S-13-3 (Max 3, Weyland agenda, influence over the limit never blocks a +,
// editor ≡ game on built decks), S-13-5 (a 46-card deck deals exactly those 46 cards).
import {
  IDENTITIES,
  STANDARD_DECKS,
  addBlock,
  checkDeck,
  countsOf,
  deckFromCounts,
  deckPool,
  deckStatus,
  getCard,
  type DeckDef,
} from '@overclock/cards';
import { describe, expect, it } from 'vitest';
import { isPlayableDeck, newGame, type Side } from '../src/index';

const sorted = (xs: readonly string[]) => [...xs].sort();

/** QA's own deck built "by taps" from empty: all 9 HB/neutral agendas + 37 in-faction/neutral cards = 46. */
const QA_CORP46: Record<string, number> = {
  c10: 3, c09: 3, c23: 3,
  c01: 3, c03: 3, c04: 3, c06: 3, c14: 3, c15: 3, c16: 3, c17: 3, c18: 3, c19: 3, c20: 3, c21: 3,
  c24: 1,
};

/** Tiny seeded RNG (QA's own; not the devs' helper). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('QA S-13-2: the pool the editor lists', () => {
  it('Corp: 24 cards in agenda, ICE, asset, upgrade, operation order, no identity; Runner: 20 in event, hardware, resource, program', () => {
    const corp = deckPool('corp');
    expect(corp.map((g) => g.type)).toEqual(['agenda', 'ice', 'asset', 'upgrade', 'operation']);
    expect(corp.flatMap((g) => g.cards).length).toBe(24);
    const runner = deckPool('runner');
    expect(runner.map((g) => g.type)).toEqual(['event', 'hardware', 'resource', 'program']);
    expect(runner.flatMap((g) => g.cards).length).toBe(20);
    for (const side of ['corp', 'runner'] as const) {
      for (const c of deckPool(side).flatMap((g) => g.cards)) {
        expect(c.side).toBe(side);
        expect(c.type).not.toBe('identity');
      }
    }
  });

  it('the proposal\'s note holds: HB may use exactly Priority Requisition, Private Security Force, Accelerated Beta Test = 21 points at 3 each', () => {
    const empty: DeckDef = { identity: IDENTITIES.corp, cards: [] };
    const usable = deckPool('corp')
      .find((g) => g.type === 'agenda')!
      .cards.filter((c) => addBlock(empty, c.id) === null)
      .map((c) => c.name)
      .sort();
    expect(usable).toEqual(['Accelerated Beta Test', 'Priority Requisition', 'Private Security Force']);
    const pts = ['c10', 'c09', 'c23'].reduce((n, id) => n + 3 * getCard(id)!.agendaPoints!, 0);
    expect(pts).toBe(21);
  });
});

describe('QA S-13-3: what dims a +', () => {
  it('a 4th copy: max_copies; Hostile Takeover in HB: agenda_faction haas_bioroid / weyland (even in an empty deck)', () => {
    expect(addBlock(STANDARD_DECKS.corp, 'c01')).toEqual({ kind: 'max_copies', limit: 3 });
    expect(addBlock({ identity: IDENTITIES.corp, cards: [] }, 'c08')).toEqual({ kind: 'agenda_faction', identityFaction: 'haas_bioroid', cardFaction: 'weyland' });
    expect(addBlock(STANDARD_DECKS.corp, 'c08')).toEqual({ kind: 'agenda_faction', identityFaction: 'haas_bioroid', cardFaction: 'weyland' });
  });

  it('influence never blocks a +: Runner at 15/15 can add a Ninja and the deck shows 17 / 15 and is not legal', () => {
    const d = deckFromCounts(IDENTITIES.runner, { ...countsOf(STANDARD_DECKS.runner), r06: 1, r08: 3, r01: 3 });
    // standard 10 + Ninja 2 + Cyberfeeder +1 + Easy Mark +2 = 15
    expect(deckStatus(d).influence).toBe(15);
    expect(deckStatus(d).legal).toBe(true);
    expect(addBlock(d, 'r06')).toBeNull();
    const over = deckFromCounts(IDENTITIES.runner, { ...countsOf(d), r06: 2 });
    const s = deckStatus(over);
    expect([s.influence, s.influenceLimit, s.legal]).toEqual([17, 15, false]);
    expect(s.problems.some((p) => p.kind === 'influence')).toBe(true);
  });

  it('agenda points never block a +: an allowed agenda below 3 copies can be added whatever the points', () => {
    const d = deckFromCounts(IDENTITIES.corp, { ...countsOf(STANDARD_DECKS.corp), c10: 2 });
    expect(deckStatus(d).agendaPoints).toBe(18);
    expect(addBlock(d, 'c10')).toBeNull();
    // Too many points (an extra 3-pointer pushed into a 45-card deck by removing a Hedge Fund) still is not a + block.
    const many = deckFromCounts(IDENTITIES.corp, { ...countsOf(STANDARD_DECKS.corp), c09: 2 });
    expect(addBlock(many, 'c09')).toBeNull();
  });

  it('random tap walks from empty (+ only when not dimmed, − when > 0): editor Ready ≡ checkDeck ≡ isPlayableDeck ≡ newGame deals it', () => {
    let legalSeen = 0;
    let illegalSeen = 0;
    for (const side of ['corp', 'runner'] as Side[]) {
      const pool = deckPool(side).flatMap((g) => g.cards.map((c) => c.id));
      for (let walk = 0; walk < 12; walk++) {
        const r = lcg(1000 + walk * 7 + (side === 'corp' ? 0 : 500));
        // Start from the standard counts half the time so legal decks are common.
        let counts: Record<string, number> = walk % 2 === 0 ? { ...countsOf(STANDARD_DECKS[side]) } : {};
        for (let step = 0; step < 80; step++) {
          const id = pool[Math.floor(r() * pool.length)]!;
          const deck = deckFromCounts(IDENTITIES[side], counts);
          if (r() < 0.55) {
            if (addBlock(deck, id) === null) counts = { ...counts, [id]: (counts[id] ?? 0) + 1 };
          } else if ((counts[id] ?? 0) > 0) {
            counts = { ...counts, [id]: counts[id]! - 1 };
          }
          const next = deckFromCounts(IDENTITIES[side], counts);
          const status = deckStatus(next);
          const check = checkDeck(next).length === 0;
          expect(status.legal).toBe(check);
          expect(isPlayableDeck(next, side)).toBe(check);
          // A + that wasn't dimmed never creates a copies or faction problem.
          expect(status.problems.some((p) => p.kind === 'too_many_copies' || p.kind === 'agenda_faction' || p.kind === 'wrong_side')).toBe(false);
          if (step < 12 || step % 10 === 9) {
            let dealt: boolean;
            try {
              const g = newGame(step + walk, { decks: { [side]: next } });
              dealt = true;
              const p = g.players[side];
              expect(sorted([...p.deck, ...p.hand])).toEqual(sorted(next.cards));
            } catch (e) {
              expect((e as Error).message).toBe('illegal_deck');
              dealt = false;
            }
            expect(dealt).toBe(check);
            if (check) legalSeen++;
            else illegalSeen++;
          }
        }
      }
    }
    expect(legalSeen).toBeGreaterThan(5);
    expect(illegalSeen).toBeGreaterThan(5);
  });
});

describe('QA S-13-5: your own deck is what is dealt', () => {
  it('QA\'s 46-card Corp deck is Ready (46 / 45, influence 0 / 15, agenda 21 needs 20–21) and R&D + HQ = exactly those 46 cards, for 5 seeds', () => {
    const deck = deckFromCounts(IDENTITIES.corp, QA_CORP46);
    const s = deckStatus(deck);
    expect([s.size, s.minSize, s.influence, s.influenceLimit, s.agendaPoints, s.agendaRange, s.legal]).toEqual([46, 45, 0, 15, 21, { min: 20, max: 21 }, true]);
    for (const seed of [1, 2, 3, 42, 999]) {
      const g = newGame(seed, { decks: { corp: deck } });
      const c = g.players.corp;
      expect(c.deck.length + c.hand.length).toBe(46);
      expect(sorted([...c.deck, ...c.hand])).toEqual(sorted(deck.cards));
      // The Runner (no deck given) gets the standard deck.
      const rr = g.players.runner;
      expect(sorted([...rr.deck, ...rr.hand])).toEqual(sorted(STANDARD_DECKS.runner.cards));
    }
  });

  it('the game refuses what the editor shows as not Ready (44 cards, an identity of the other side)', () => {
    const short = deckFromCounts(IDENTITIES.corp, { ...QA_CORP46, c24: 0, c01: 1 });
    expect(short.cards.length).toBe(43);
    expect(deckStatus(short).legal).toBe(false);
    expect(() => newGame(1, { decks: { corp: short } })).toThrow('illegal_deck');
    const swapped = deckFromCounts(IDENTITIES.runner, countsOf(STANDARD_DECKS.corp));
    expect(isPlayableDeck(swapped, 'corp')).toBe(false);
    expect(() => newGame(1, { decks: { corp: swapped } })).toThrow('illegal_deck');
  });
});
