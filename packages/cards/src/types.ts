export type Side = 'corp' | 'runner';

export type RunnerCardType = 'event' | 'program' | 'hardware' | 'resource';
export type CorpCardType = 'agenda' | 'asset' | 'upgrade' | 'operation' | 'ice';
export type CardType = RunnerCardType | CorpCardType;

export type IceSubtype = 'barrier' | 'code_gate' | 'sentry';
export type BreakerSubtype = 'breaker_barrier' | 'breaker_code_gate' | 'breaker_sentry';

/** Central servers, then remotes `remote1`, `remote2`, ... (numbers never reused). */
export type CentralServerId = 'hq' | 'rd' | 'archives';
export type ServerId = CentralServerId | `remote${number}`;

/**
 * Card effect DSL v1 (Sprint 3). The engine resolves these generically; there
 * is no per-card code. A primitive is added only when >= 2 cards (or a whole
 * card kind) need it.
 * - `gain_credits`: the card's owner gains `amount` credits.
 * - `draw`: the owner draws up to `count` cards; stops at an empty deck (no loss).
 * - `net_damage`: the Runner discards `amount` random cards from its Grip; more
 *   damage than cards in the Grip flatlines the Runner (Corp wins).
 * - `lose_clicks`: the Runner loses up to `amount` clicks ("if able").
 * - `end_run`: the current run ends at once (nothing accessed).
 * - `run`: the Runner makes a run (must be the card's last effect). `server`
 *   fixes the server (absent = the player names it in the `play` action);
 *   `extraAccess` = additional R&D cards accessed if successful; `bypassFirst`
 *   = the first ICE encountered in the run is bypassed.
 */
export type Effect =
  | { readonly op: 'gain_credits'; readonly amount: number }
  | { readonly op: 'draw'; readonly count: number }
  | { readonly op: 'net_damage'; readonly amount: number }
  | { readonly op: 'lose_clicks'; readonly amount: number }
  | { readonly op: 'end_run' }
  | {
      readonly op: 'run';
      readonly server?: ServerId;
      readonly extraAccess?: number;
      readonly bypassFirst?: boolean;
    };

/** One ICE subroutine: its printed text (without "Subroutine:") and what it does when it fires. */
export interface Subroutine {
  readonly text: string;
  readonly effect: Effect;
}

/**
 * An icebreaker ability, used during an encounter with rezzed ICE.
 * - `break`: pay `cost` to break `count` subroutine(s) of ICE of `iceType`
 *   (needs breaker strength >= ICE strength).
 * - `strength`: pay `cost` for +`amount` strength until the end of the
 *   current encounter, or until the end of the run.
 */
export type BreakerAbility =
  | { readonly op: 'break'; readonly cost: number; readonly iceType: IceSubtype; readonly count: 1 }
  | { readonly op: 'strength'; readonly cost: number; readonly amount: number; readonly until: 'encounter' | 'run' };

/** A play condition checked before paying (`condition_not_met` when false). */
export type PlayCondition = 'runner_ran_last_turn';

/** A system the card's effect needs that is not built yet; the engine refuses it with `not_implemented`. */
export type CardNeeds = 'runs';

/**
 * A card definition. Pure data. Behaviour is described with the effect DSL
 * (`onPlay`, `subroutines`, `abilities`) or not built yet (`needs`); cards
 * with none simply sit on the table (their text says what they will do later).
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
  /** Operations/events: may be played only when this holds. */
  readonly playIf?: PlayCondition;
  /** ICE: subroutines, in printed order. */
  readonly subroutines?: readonly Subroutine[];
  /** Icebreakers: abilities, in printed order (`use_ability.ability` indexes this). */
  readonly abilities?: readonly BreakerAbility[];
  /** Set when the card cannot be played yet because it needs an unbuilt system. */
  readonly needs?: CardNeeds;
}

/** A deck list is an ordered list of card ids; duplicates mean extra copies. */
export type DeckList = readonly string[];
