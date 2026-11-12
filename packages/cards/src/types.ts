export type Side = 'corp' | 'runner';

export type RunnerCardType = 'event' | 'program' | 'hardware' | 'resource';
export type CorpCardType = 'agenda' | 'asset' | 'upgrade' | 'operation' | 'ice';
export type CardType = RunnerCardType | CorpCardType;

export type IceSubtype = 'barrier' | 'code_gate' | 'sentry';
export type BreakerSubtype = 'breaker_barrier' | 'breaker_code_gate' | 'breaker_sentry';

/**
 * Card effect DSL v0 (Sprint 2). The engine resolves these generically; there
 * is no per-card code. A primitive is added only when >= 2 cards need it.
 * - `gain_credits`: the card's owner gains `amount` credits.
 * - `draw`: the owner draws up to `count` cards; stops at an empty deck (no loss).
 */
export type Effect =
  | { readonly op: 'gain_credits'; readonly amount: number }
  | { readonly op: 'draw'; readonly count: number };

/** A system the card's effect needs that is not built yet; the engine refuses it with `not_implemented`. */
export type CardNeeds = 'runs';

/**
 * A card definition. Pure data. Behaviour is described with the effect DSL
 * (`onPlay`) or not built yet (`needs`); cards with neither simply sit on the
 * table (their text says what they will do later).
 */
export interface CardDef {
  /** Stable id, unique across both sides, e.g. "r01". */
  readonly id: string;
  readonly name: string;
  readonly side: Side;
  readonly type: CardType;
  /** Play/install cost (Runner, operations) or rez cost (Corp installables). Agendas: 0. */
  readonly cost: number;
  /** Rules text in plain words. */
  readonly text: string;
  readonly flavor?: string;
  /** Placeholder art key; the client draws a generated neon glyph for it. */
  readonly art: string;
  readonly subtype?: IceSubtype | BreakerSubtype;
  /** ICE and breaker strength. */
  readonly strength?: number;
  /** Memory used by programs. */
  readonly memory?: number;
  readonly advancementRequirement?: number;
  readonly agendaPoints?: number;
  readonly trashCost?: number;
  /** Operations/events: what happens when played, in order. */
  readonly onPlay?: readonly Effect[];
  /** Set when the card cannot be played yet because it needs an unbuilt system. */
  readonly needs?: CardNeeds;
}

/** A deck list is an ordered list of card ids; duplicates mean extra copies. */
export type DeckList = readonly string[];
