export type Side = 'corp' | 'runner';

export type RunnerCardType = 'event' | 'program' | 'hardware' | 'resource';
export type CorpCardType = 'agenda' | 'asset' | 'upgrade' | 'operation' | 'ice';
export type CardType = RunnerCardType | CorpCardType;

export type IceSubtype = 'barrier' | 'code_gate' | 'sentry';
export type BreakerSubtype = 'breaker_barrier' | 'breaker_code_gate' | 'breaker_sentry';

/**
 * A card definition. Pure data: no behaviour lives here yet.
 * Sprint 0 only uses id/name/side/type/cost/text/art; the optional stats are
 * there so the client can render a sensible card face. Effects will be added
 * as an effect DSL in a later sprint (only once >=2 cards need a primitive).
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
}

/** A deck list is an ordered list of card ids; duplicates mean extra copies. */
export type DeckList = readonly string[];
