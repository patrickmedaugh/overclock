/**
 * Sprint 8: deck-building rules as a pure check (real Core Set rules, house minimum size).
 * Used by tests on both core decks, so any swap in a list is checked automatically.
 */
import { CORP_CARDS, CORP_CORE45_DECK } from './corp';
import { RUNNER_CARDS, RUNNER_CORE45_DECK } from './runner';
import type { CardDef, CardType, DeckDef, Faction, Side } from './types';

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
    const { min: lo, max: hi } = agendaRangeFor(size);
    const points = deckAgendaPoints(deck);
    if (points < lo || points > hi) out.push({ kind: 'agenda_points', points, min: lo, max: hi });
  }
  return out;
}

/** The Corp's legal agenda points for a deck of `size` cards: [2·⌊size/5⌋ + 2, that + 1] (one formula for `checkDeck` and `deckStatus`). */
function agendaRangeFor(size: number): { min: number; max: number } {
  const lo = 2 * Math.floor(size / 5) + 2;
  return { min: lo, max: lo + 1 };
}

// ---------------------------------------------------------------------------------------------
// Sprint 13 (deck builder). Every helper below is built on `checkDeck`, never beside it, so the
// editor and the game can't disagree. Pinned by `test/sprint13-decks.test.ts` (E2) and the engine's
// `test/sprint13-custom-decks.test.ts` (deckStatus ≡ checkDeck ≡ newGame on 300 random decks). The client turns the codes into words (`deckText.ts`).
// ---------------------------------------------------------------------------------------------

/** Every card in `ALL_CARDS` order (Runner, then Corp): the canonical deal order of a counted deck. */
const CANONICAL: readonly CardDef[] = [...RUNNER_CARDS, ...CORP_CARDS];
const CANONICAL_INDEX: ReadonlyMap<string, number> = new Map(CANONICAL.map((c, i) => [c.id, i]));

/** Sprint 13: the one identity of each side in this pool (Haas-Bioroid, Kate). */
export const IDENTITIES: Readonly<Record<Side, string>> = { corp: CORP_CORE45_DECK.identity, runner: RUNNER_CORE45_DECK.identity };

/** Sprint 13: the standard decks (= the 45-card `core45` lists). Read-only; never stored. */
export const STANDARD_DECKS: Readonly<Record<Side, DeckDef>> = { corp: CORP_CORE45_DECK, runner: RUNNER_CORE45_DECK };

/** Sprint 13: the editor's group order (AC): Corp agenda, ICE, asset, upgrade, operation; Runner event, hardware, resource, program. */
const POOL_GROUPS: Readonly<Record<Side, readonly CardType[]>> = {
  corp: ['agenda', 'ice', 'asset', 'upgrade', 'operation'],
  runner: ['event', 'hardware', 'resource', 'program'],
};

/** Sprint 13: one group of the editor's card list. */
export interface DeckPoolGroup {
  readonly type: CardType;
  readonly cards: readonly CardDef[];
}

/**
 * Sprint 13: every non-identity card of `side`, grouped in the editor's order, by name inside a group
 * (empty groups left out). New cards show up by themselves.
 */
export function deckPool(side: Side): readonly DeckPoolGroup[] {
  const cards = CANONICAL.filter((c) => c.side === side && c.type !== 'identity');
  return POOL_GROUPS[side]
    .map((type) => ({ type, cards: cards.filter((c) => c.type === type).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) }))
    .filter((g) => g.cards.length > 0);
}

/** Sprint 13: the editor's bar numbers plus every problem `checkDeck` finds. */
export interface DeckStatus {
  readonly size: number;
  /** The identity's own minimum (45 for both Core identities). */
  readonly minSize: number;
  readonly influence: number;
  readonly influenceLimit: number;
  readonly agendaPoints: number;
  /** Corp: the legal agenda-point range for this size; Runner: null. */
  readonly agendaRange: { readonly min: number; readonly max: number } | null;
  /** `checkDeck(deck)`, unchanged. */
  readonly problems: readonly DeckProblem[];
  /** `problems.length === 0` (≡ `checkDeck(deck).length === 0` ≡ `newGame` accepts the deck). */
  readonly legal: boolean;
}

/** Sprint 13: the editor's bar for `deck` (identity's own minimum size, as the game uses). */
export function deckStatus(deck: DeckDef): DeckStatus {
  const identity = BY_ID.get(deck.identity);
  const problems = checkDeck(deck);
  const size = deck.cards.length;
  return {
    size,
    minSize: identity?.minDeckSize ?? 0,
    influence: deckInfluence(deck),
    influenceLimit: identity?.influenceLimit ?? 0,
    agendaPoints: deckAgendaPoints(deck),
    agendaRange: identity?.side === 'corp' ? agendaRangeFor(size) : null,
    problems,
    legal: problems.length === 0,
  };
}

/**
 * Sprint 13: why the editor's **+** for a card is dimmed. Influence and agenda points never block
 * a + (the bar goes red instead).
 */
export type AddBlock =
  | { readonly kind: 'max_copies'; readonly limit: number }
  | { readonly kind: 'agenda_faction'; readonly identityFaction: Faction; readonly cardFaction: Faction }
  | { readonly kind: 'wrong_side' }
  /** No such card, or a card that can't be in a deck at all (an identity). */
  | { readonly kind: 'unknown_card' };

/**
 * Sprint 13: runs `checkDeck` on `deck` plus one copy of `cardId` and returns the problem that copy
 * has (null = the + is allowed).
 */
export function addBlock(deck: DeckDef, cardId: string): AddBlock | null {
  const identity = BY_ID.get(deck.identity);
  const card = BY_ID.get(cardId);
  for (const p of checkDeck({ identity: deck.identity, cards: [...deck.cards, cardId] })) {
    if (!('cardId' in p) || p.cardId !== cardId) continue;
    switch (p.kind) {
      case 'unknown_card':
      case 'not_identity':
      case 'identity_in_deck':
        return { kind: 'unknown_card' };
      case 'wrong_side':
        return { kind: 'wrong_side' };
      case 'too_many_copies':
        return { kind: 'max_copies', limit: MAX_COPIES };
      case 'agenda_faction':
        return { kind: 'agenda_faction', identityFaction: identity?.faction ?? 'neutral', cardFaction: card?.faction ?? 'neutral' };
    }
  }
  return null;
}

/** Sprint 13: id → copies (only ids with ≥ 1 copy; the identity is not counted). */
export function countsOf(deck: DeckDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of deck.cards) out[id] = (out[id] ?? 0) + 1;
  return out;
}

/**
 * Sprint 13: a counted deck as a `DeckDef` in canonical order (`ALL_CARDS` order, copies adjacent),
 * so the same counts always deal the same for a seed. Counts below 1 are dropped (non-whole counts
 * rounded down); unknown ids are kept at the end, sorted, so `checkDeck` reports them.
 */
export function deckFromCounts(identity: string, counts: Readonly<Record<string, number>>): DeckDef {
  const ids = Object.keys(counts).sort((a, b) => {
    const ia = CANONICAL_INDEX.get(a) ?? Infinity;
    const ib = CANONICAL_INDEX.get(b) ?? Infinity;
    return ia !== ib ? ia - ib : a < b ? -1 : a > b ? 1 : 0;
  });
  const cards: string[] = [];
  for (const id of ids) {
    const n = Math.floor(counts[id] ?? 0);
    for (let i = 0; i < n; i++) cards.push(id);
  }
  return { identity, cards };
}
