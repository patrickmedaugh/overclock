export type Side = 'corp' | 'runner';

export type RunnerCardType = 'event' | 'program' | 'hardware' | 'resource';
export type CorpCardType = 'agenda' | 'asset' | 'upgrade' | 'operation' | 'ice';
/** Sprint 8: `'identity'` = the card a side plays as (never in a deck; one per side, uids `id:corp` / `id:runner`). */
export type CardType = RunnerCardType | CorpCardType | 'identity';

/** Sprint 8: a card's faction (colour-coded team). Influence counts cards outside the identity's faction. */
export type Faction = 'haas_bioroid' | 'jinteki' | 'nbn' | 'weyland' | 'anarch' | 'criminal' | 'shaper' | 'neutral';

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
 * - `bad_publicity` (Sprint 4): the Corp takes `amount` bad publicity.
 * - `free_rez` (Sprint 4): the Corp may rez one installed, unrezzed ICE for
 *   free. Opens a choice (phase `choice`) and must be the card's last effect;
 *   no choice opens when the Corp has no unrezzed installed ICE.
 * Sprint 7 (DSL v2, hosted credits; need an installed source card):
 * - `place_credits`: put `amount` credits from the bank on the source card.
 * - `take_credits`: move up to `amount` (or `'all'`) of the source card's credits to its owner.
 * Sprint 8 (DSL v3):
 * - `gain_clicks`: the card's owner gains `amount` clicks (Biotic Labor).
 * - `brain_damage`: the Runner's maximum hand size drops by `amount` for the rest of the game, then
 *   `amount` random Grip cards go to the Heap (more than the Grip holds = flatline, as net damage).
 * - `trash_installed`: trash 1 installed Runner card of `types`; the Corp chooses (0 candidates =
 *   nothing, 1 = that one, 2+ = a `trash_target` choice). A rig card with `trashPrevention` covering
 *   the target's type may be trashed instead (Runner's `prevent_trash` choice).
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
    }
  | { readonly op: 'bad_publicity'; readonly amount: number }
  | { readonly op: 'free_rez'; readonly what: 'ice' }
  /** Sprint 7: put `amount` credits from the bank on the source card (`EffectContext.uid`). */
  | { readonly op: 'place_credits'; readonly amount: number }
  /**
   * Sprint 7: move up to `amount` credits (`'all'` = every one) from the source card to its
   * owner's pool. Stops at what the card holds.
   */
  | { readonly op: 'take_credits'; readonly amount: number | 'all' }
  /** Sprint 8: the owner gains `amount` clicks. */
  | { readonly op: 'gain_clicks'; readonly amount: number }
  /** Sprint 8: brain damage to the Runner (hand size −amount for good, then random discards). */
  | { readonly op: 'brain_damage'; readonly amount: number }
  /** Sprint 8: trash 1 installed Runner card of one of `types` (Corp chooses). */
  | { readonly op: 'trash_installed'; readonly types: readonly RunnerCardType[] };

/** One ICE subroutine: its printed text (without "Subroutine:") and what it does when it fires. */
export interface Subroutine {
  readonly text: string;
  readonly effect: Effect;
}

/**
 * An icebreaker ability, used during an encounter with rezzed ICE.
 * - `break`: pay `cost` to break `count` subroutine(s) of ICE of `iceType`
 *   (needs breaker strength >= ICE strength). Sprint 8: `count: 2` = "break up to 2" (Battering Ram):
 *   `use_ability.subs` names 1–2 unbroken subroutines, one payment.
 * - `strength`: pay `cost` for +`amount` strength until the end of the
 *   current encounter, or until the end of the run.
 */
export type BreakerAbility =
  | { readonly op: 'break'; readonly cost: number; readonly iceType: IceSubtype; readonly count: 1 | 2 }
  | { readonly op: 'strength'; readonly cost: number; readonly amount: number; readonly until: 'encounter' | 'run' };

/**
 * Sprint 7: an ability of an installed card (not an icebreaker's: those are `abilities`).
 * - `when: 'click'`: in its owner's action phase (costs `clicks` + `credits`).
 * - `when: 'successful_run_remote'`: after a successful run on a remote server, before access
 *   (run step `success`); with `replacesAccess` using it ends the run with nothing accessed.
 * `requires: 'hosted_credits'`: only while the card holds credits (`condition_not_met` otherwise).
 * `label` is the button text; `{gain}` is filled in by the client from `CardOption.gain`.
 */
export interface CardAbility {
  readonly label: string;
  readonly when: 'click' | 'successful_run_remote';
  readonly clicks: number;
  readonly credits: number;
  readonly requires?: 'hosted_credits';
  readonly replacesAccess?: true;
  readonly effects: readonly Effect[];
}

/** Sprint 7: recurring credits, placed on install and refilled to `amount` at its owner's turn start. */
export interface RecurringCredits {
  readonly amount: number;
  /** What they may pay for: `'icebreaker'` = icebreaker abilities only. */
  readonly for: 'icebreaker';
}

/**
 * Sprint 8: "the first time you install a card each turn" (Haas-Bioroid identity). Read from active
 * sources (the side's identity + its face-up installed cards); fires after the install when the side
 * had installed nothing of `types` (absent = any type) yet this turn.
 */
export interface InstallTrigger {
  readonly firstEachTurn: true;
  readonly types?: readonly CardType[];
  readonly effects: readonly Effect[];
}

/**
 * Sprint 8: "lower the install cost of the first <types> you install each turn by `amount`" (Kate),
 * never below 0. Used up by the first install of those types that turn, even a free one.
 */
export interface InstallDiscount {
  readonly amount: number;
  readonly firstEachTurn: true;
  readonly types: readonly CardType[];
}

/** Sprint 8: "Trash this card: prevent an installed card of `types` from being trashed" (Sacrificial Construct). */
export interface TrashPrevention {
  readonly types: readonly CardType[];
}

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
  /** Sprint 8: the card's faction. */
  readonly faction: Faction;
  /** Sprint 8: influence pips (cost against an identity of another faction); absent = 0. */
  readonly influence?: number;
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
  /**
   * Agendas: what happens when the Corp scores it, in order (never when stolen;
   * skipped when the score wins the game). `free_rez` must be last.
   */
  readonly onScore?: readonly Effect[];
  /** Operations/events: may be played only when this holds. */
  readonly playIf?: PlayCondition;
  /** ICE: subroutines, in printed order. */
  readonly subroutines?: readonly Subroutine[];
  /** Icebreakers: abilities, in printed order (`use_ability.ability` indexes this). */
  readonly abilities?: readonly BreakerAbility[];
  /** Set when the card cannot be played yet because it needs an unbuilt system. */
  readonly needs?: CardNeeds;
  // ---- Sprint 7 (DSL v2) ----
  /** Installed cards: what happens right after it is installed (source = the installed card). */
  readonly onInstall?: readonly Effect[];
  /** What happens when its owner's turn begins (Corp cards only while rezzed). */
  readonly onTurnStart?: readonly Effect[];
  /** Installed-card abilities (`activate.ability` indexes this). */
  readonly cardAbilities?: readonly CardAbility[];
  /** Recurring credits on the card. */
  readonly recurringCredits?: RecurringCredits;
  /** Goes to its owner's discard pile when its hosted credits reach 0. */
  readonly trashWhenEmpty?: true;
  /** Runner hardware: added to the memory limit while installed. */
  readonly memoryBonus?: number;
  /** Rezzed upgrade: rez cost of ICE protecting its server is lowered by this (never below 0). */
  readonly iceRezDiscount?: number;
  /** ICE: the Corp may advance it like an agenda. */
  readonly advanceable?: true;
  /** ICE: + strength per advancement counter. */
  readonly strengthPerAdvancement?: number;
  // ---- Sprint 8 (DSL v3) ----
  /** Identities: smallest legal deck. */
  readonly minDeckSize?: number;
  /** Identities: influence allowed for other-faction cards. */
  readonly influenceLimit?: number;
  /** Identities: base link (shown only; traces come later). */
  readonly link?: number;
  /** Active source: something happens the first time its side installs a card each turn. */
  readonly whenYouInstall?: InstallTrigger;
  /** Active source: the first install of some types each turn costs less. */
  readonly installDiscount?: InstallDiscount;
  /** Corp cards: what happens when it turns face up (any rez: action phase, approach, free rez). */
  readonly onRez?: readonly Effect[];
  /** Runner cards: may be trashed instead of an installed card of these types. */
  readonly trashPrevention?: TrashPrevention;
}

/** A deck list is an ordered list of card ids; duplicates mean extra copies. */
export type DeckList = readonly string[];

/** Sprint 8: a deck = an identity card id and a list of card ids (identity not in the list). */
export interface DeckDef {
  readonly identity: string;
  readonly cards: DeckList;
}
