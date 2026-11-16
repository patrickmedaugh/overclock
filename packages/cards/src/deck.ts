/**
 * Sprint 8: deck-building rules as a pure check (real Core Set rules, house minimum size).
 * Used by tests on both core decks, so any swap in a list is checked automatically.
 */
import { CORP_CARDS } from './corp';
import { RUNNER_CARDS } from './runner';
import type { CardDef, DeckDef } from './types';

/** House rule (owner Q2 A, Sprint 8): decks are 30 cards; the real identities' minimum is 45. */
export const HOUSE_MIN_DECK_SIZE = 30;

/** At most this many copies of one card. */
export const MAX_COPIES = 3;

export type DeckProblem =
  /** An id in the list (or the identity) that is no card. */
  | { readonly kind: 'unknown_card'; readonly cardId: string }
  /** The identity id is not an identity card. */
  | { readonly kind: 'not_identity'; readonly cardId: string }
  | { readonly kind: 'too_small'; readonly size: number; readonly min: number }
  /** A card of the other side. */
  | { readonly kind: 'wrong_side'; readonly cardId: string }
  | { readonly kind: 'identity_in_deck'; readonly cardId: string }
  | { readonly kind: 'too_many_copies'; readonly cardId: string; readonly copies: number }
  /** An agenda that is neither the identity's faction nor neutral. */
  | { readonly kind: 'agenda_faction'; readonly cardId: string }
  /** Other-faction influence above the identity's limit. */
  | { readonly kind: 'influence'; readonly used: number; readonly limit: number }
  /** Corp: agenda points outside [2·⌊size/5⌋ + 2, that + 1]. */
  | { readonly kind: 'agenda_points'; readonly points: number; readonly min: number; readonly max: number };

const BY_ID: ReadonlyMap<string, CardDef> = new Map([...CORP_CARDS, ...RUNNER_CARDS].map((c) => [c.id, c]));

/** Influence `deck` spends: pips of every card outside the identity's faction (neutral cards cost their pips too). */
export function deckInfluence(deck: DeckDef): number {
  const identity = BY_ID.get(deck.identity);
  return deck.cards.reduce((sum, id) => {
    const c = BY_ID.get(id);
    return c && c.faction !== identity?.faction ? sum + (c.influence ?? 0) : sum;
  }, 0);
}

/** Agenda points in `deck`. */
export function deckAgendaPoints(deck: DeckDef): number {
  return deck.cards.reduce((sum, id) => sum + (BY_ID.get(id)?.agendaPoints ?? 0), 0);
}

/**
 * Every rule `deck` breaks (empty = legal), in a stable order. `minDeckSize` overrides the
 * identity's own minimum (the house rule passes HOUSE_MIN_DECK_SIZE).
 */
export function checkDeck(deck: DeckDef, opts: { readonly minDeckSize?: number } = {}): DeckProblem[] {
  const out: DeckProblem[] = [];
  const identity = BY_ID.get(deck.identity);
  if (!identity) out.push({ kind: 'unknown_card', cardId: deck.identity });
  else if (identity.type !== 'identity') out.push({ kind: 'not_identity', cardId: deck.identity });
  const size = deck.cards.length;
  const min = opts.minDeckSize ?? identity?.minDeckSize ?? 0;
  if (size < min) out.push({ kind: 'too_small', size, min });
  const copies = new Map<string, number>();
  for (const id of deck.cards) copies.set(id, (copies.get(id) ?? 0) + 1);
  for (const [id, n] of copies) {
    const c = BY_ID.get(id);
    if (!c) {
      out.push({ kind: 'unknown_card', cardId: id });
      continue;
    }
    if (identity && c.side !== identity.side) out.push({ kind: 'wrong_side', cardId: id });
    if (c.type === 'identity') out.push({ kind: 'identity_in_deck', cardId: id });
    if (n > MAX_COPIES) out.push({ kind: 'too_many_copies', cardId: id, copies: n });
    if (c.type === 'agenda' && identity && c.faction !== identity.faction && c.faction !== 'neutral') out.push({ kind: 'agenda_faction', cardId: id });
  }
  const limit = identity?.influenceLimit ?? 0;
  const used = deckInfluence(deck);
  if (used > limit) out.push({ kind: 'influence', used, limit });
  if (identity?.side === 'corp') {
    const lo = 2 * Math.floor(size / 5) + 2;
    const points = deckAgendaPoints(deck);
    if (points < lo || points > lo + 1) out.push({ kind: 'agenda_points', points, min: lo, max: lo + 1 });
  }
  return out;
}
