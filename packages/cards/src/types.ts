export type Side = 'corp' | 'runner';

export type RunnerCardType = 'event' | 'program' | 'hardware' | 'resource';
export type CorpCardType = 'agenda' | 'asset' | 'upgrade' | 'operation' | 'ice';
export type CardType = RunnerCardType | CorpCardType;

export type IceSubtype = 'barrier' | 'code_gate' | 'sentry';
export type BreakerSubtype = 'breaker_barrier' | 'breaker_code_gate' | 'breaker_sentry';

/**
 * Effect DSL v1: what an operation/event does when played. The engine's
 * interpreter (`packages/engine/src/effects.ts`) handles every op; it never
 * looks at card ids. Add an op only when at least two cards need it.
 */
export type Effect =
  /** The player gains `amount` credits. */
  | { readonly op: 'gain_credits'; readonly amount: number }
  /** The player draws up to `count` cards (a short deck gives fewer, with no loss). */
  | { readonly op: 'draw'; readonly count: number };

/** A feature the engine has not built yet. Playing a card that needs it is refused. */
export type Needs = 'runs';

/**
 * A card definition. Pure data. Behavior is described with the effect DSL
 * (`onPlay`) or flagged as needing an unbuilt feature (`needs`).
 */
export interface CardDef {
  /** Stable id, unique across both sides, e.g. "r01". */
  readonly id: string;
  readonly name: string;
  readonly side: Side;
  readonly type: CardType;
  /** Play/install cost (Runner, operations) or rez cost (Corp installables). Agendas: 0. */
  readonly cost: number;
  /**
   * Official rules text. Symbols are written as tokens the client draws as
   * glyphs: `[click]`, `[credit]`, `[subroutine]`, `[mu]`.
   */
  readonly text: string;
  /** Official keyword line, e.g. "Barrier" or "Icebreaker - Fracter". */
  readonly keywords?: string;
  readonly flavor?: string;
  /** Art key; the client draws a generated neon glyph for it (no copied art). */
  readonly art: string;
  readonly subtype?: IceSubtype | BreakerSubtype;
  /** ICE and breaker strength. */
  readonly strength?: number;
  /** Memory used by programs. */
  readonly memory?: number;
  readonly advancementRequirement?: number;
  readonly agendaPoints?: number;
  readonly trashCost?: number;
  /** Operations/events: what happens when played. */
  readonly onPlay?: readonly Effect[];
  /** The card needs a feature that is not built yet; playing it is refused (`needs_runs`). */
  readonly needs?: Needs;
}

/** A deck list is an ordered list of card ids; duplicates mean extra copies. */
export type DeckList = readonly string[];
