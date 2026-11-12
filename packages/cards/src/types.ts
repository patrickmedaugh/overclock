export type Side = 'corp' | 'runner';

export type RunnerCardType = 'event' | 'program' | 'hardware' | 'resource';
export type CorpCardType = 'agenda' | 'asset' | 'upgrade' | 'operation' | 'ice';
export type CardType = RunnerCardType | CorpCardType;

export type IceSubtype = 'barrier' | 'code_gate' | 'sentry';
export type BreakerSubtype = 'breaker_barrier' | 'breaker_code_gate' | 'breaker_sentry';

/**
 * A card definition. Pure data. Behaviour is described with the effect DSL
 * (`onPlay`, `needs`); the optional stats let the client render a card face
 * and the engine apply costs and memory.
 */
export interface CardDef {
  /** Stable id, unique across both sides, e.g. "r01". */
  readonly id: string;
  /** Official card name. */
  readonly name: string;
  readonly side: Side;
  readonly type: CardType;
  /** Play/install cost (Runner, operations) or rez cost (Corp installables). Agendas: 0. */
  readonly cost: number;
  /** Official rules text, with symbols spelled as words ("Gain 9 credits.", "click"). */
  readonly text: string;
  readonly flavor?: string;
  /** Art key; the client draws a generated neon glyph for it (our own art). */
  readonly art: string;
  readonly subtype?: IceSubtype | BreakerSubtype;
  /** ICE and breaker strength. */
  readonly strength?: number;
  /** Memory used by programs. */
  readonly memory?: number;
  readonly advancementRequirement?: number;
  readonly agendaPoints?: number;
  readonly trashCost?: number;
  /** Operations/events: what happens when the card is played, in order. */
  readonly onPlay?: readonly Effect[];
  /** Set when the card cannot work yet (its systems are not built). */
  readonly needs?: CardNeeds;
}

/**
 * Card effect DSL v0 (Sprint 2). An effect is plain data the engine
 * interprets; there is no per-card code. Add a primitive only when two or more
 * cards need it.
 * - `gain_credits`: the player gains `amount` credits.
 * - `draw`: the player draws `count` cards, one at a time; it stops early when
 *   the deck runs out (no loss: only the Corp's mandatory draw can lose).
 */
export type Effect =
  | { readonly op: 'gain_credits'; readonly amount: number }
  | { readonly op: 'draw'; readonly count: number };

/**
 * Systems a card needs that are not built yet. The engine refuses to play or
 * install such a card (`not_implemented`); the client shows "Needs runs".
 */
export type CardNeeds = 'runs';

/** A deck list is an ordered list of card ids; duplicates mean extra copies. */
export type DeckList = readonly string[];
