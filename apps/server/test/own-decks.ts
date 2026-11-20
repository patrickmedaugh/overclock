// Sprint 14: own decks for room tests — seeded random legal decks (edits of the standard deck that
// still pass `isPlayableDeck`, and differ from it), and hand-broken ones.
import { countsOf, deckFromCounts, deckPool, getCard, IDENTITIES, STANDARD_DECKS, type CardDef, type DeckDef } from '@overclock/cards';
import { isPlayableDeck, type GameState, type Side } from '@overclock/engine';
import type { DeckChoice } from '@overclock/protocol';

/** Test-only seeded RNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random legal own deck for `side` (as the client sends it), different from the standard one. */
export function legalOwnDeck(r: () => number, side: Side): DeckChoice {
  const pool: CardDef[] = deckPool(side).flatMap((g) => [...g.cards]);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const standard = JSON.stringify(countsOf(STANDARD_DECKS[side]));
  for (let tries = 0; tries < 1000; tries++) {
    const cards = [...STANDARD_DECKS[side].cards];
    const edits = 1 + Math.floor(r() * 6);
    for (let i = 0; i < edits; i++) {
      const at = Math.floor(r() * cards.length);
      cards[at] = pick(pool.filter((c) => c.type === getCard(cards[at]!)!.type)).id;
    }
    if (r() < 0.3) cards.push(pick(pool.filter((c) => c.type !== 'agenda')).id);
    const counts = countsOf({ identity: IDENTITIES[side], cards });
    const deck = deckFromCounts(IDENTITIES[side], counts);
    if (isPlayableDeck(deck, side) && JSON.stringify(countsOf(deck)) !== standard) return { identity: IDENTITIES[side], cards: counts };
  }
  throw new Error('no legal deck found');
}

/** The standard deck as a DeckChoice (what "Start from the standard deck" stores). */
export function standardChoice(side: Side): DeckChoice {
  return { identity: IDENTITIES[side], cards: countsOf(STANDARD_DECKS[side]) };
}

/** Sorted card ids of `side`'s deck as dealt: R&D/Stack + HQ/Grip (at the start of a game). */
export function dealtCards(s: GameState, side: Side): string[] {
  const p = s.players[side];
  return [...p.deck, ...p.hand].sort();
}

/** Sorted card ids of a chosen deck. */
export function choiceCards(d: DeckChoice): string[] {
  return [...deckFromCounts(d.identity, d.cards).cards].sort();
}

/** Sorted card ids of a deck list. */
export function listCards(d: DeckDef): string[] {
  return [...d.cards].sort();
}
