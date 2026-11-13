import type { AccessFrom, ServerId, Side, WinReason } from './state';

/** Why an action was refused. Order of checks: see `rules.ts`. */
export type RejectReason =
  | 'invalid_action'
  | 'game_over'
  | 'not_your_turn'
  | 'wrong_phase'
  | 'no_clicks'
  | 'deck_empty'
  | 'bad_discard'
  /** Hand index out of range, or the card's type does not fit the action. */
  | 'bad_card'
  /** Install target not allowed (wrong/missing server, agenda/asset slot taken, Runner naming a server). */
  | 'bad_target'
  /** The card needs a system that is not built yet (card data `needs`). */
  | 'not_implemented'
  /** A play condition (card `playIf`) does not hold, e.g. Neural EMP without a run last turn; or an agenda without enough counters to score. */
  | 'condition_not_met'
  /** Break with a breaker whose strength is below the ICE's strength. */
  | 'too_weak'
  | 'no_credits'
  | 'no_memory';

/** How a run ended. */
export type RunOutcome = 'accessed' | 'jacked_out' | 'ended_by_ice' | 'flatline';

export type InstallZone = 'ice' | 'content' | 'rig';

/**
 * What happened, in order. Run through `viewEvents(player, events)` before
 * showing them to a player: hidden fields are removed for the opponent.
 */
export type GameEvent =
  /** cardId is omitted in the opponent's projection. */
  | { readonly type: 'card_drawn'; readonly player: Side; readonly cardId?: string }
  | { readonly type: 'credit_gained'; readonly player: Side; readonly amount: number }
  | { readonly type: 'discard_required'; readonly player: Side; readonly count: number }
  | {
      readonly type: 'cards_discarded';
      readonly player: Side;
      readonly count: number;
      /** Ascending indices into the hand before discarding. Owner only. */
      readonly handIndices?: readonly number[];
      /** Same order as handIndices. Hidden from the Runner when the Corp discards (face down). */
      readonly cardIds?: readonly string[];
    }
  | { readonly type: 'turn_ended'; readonly player: Side }
  | { readonly type: 'turn_started'; readonly player: Side; readonly turn: number; readonly clicks: number }
  | { readonly type: 'game_over'; readonly winner: Side; readonly reason: WinReason }
  | { readonly type: 'action_rejected'; readonly reason: RejectReason }
  | { readonly type: 'credits_spent'; readonly player: Side; readonly amount: number }
  | { readonly type: 'server_created'; readonly server: ServerId }
  | {
      readonly type: 'card_installed';
      readonly player: Side;
      readonly uid: string;
      readonly zone: InstallZone;
      /** Corp installs only. */
      readonly server?: ServerId;
      /** Index into the hand before installing. Owner only. */
      readonly handIndex?: number;
      /** Hidden from the Runner for Corp installs (face down). */
      readonly cardId?: string;
    }
  | {
      readonly type: 'card_played';
      readonly player: Side;
      readonly cardId: string;
      /** Index into the hand before playing. Owner only. */
      readonly handIndex?: number;
    }
  // ---- Sprint 3: runs, advancing, scoring, damage (all public unless noted) ----
  /** `cardId` = the run event that started it (face up), absent for a click run. */
  | { readonly type: 'run_started'; readonly server: ServerId; readonly cardId?: string }
  | { readonly type: 'ice_approached'; readonly uid: string; readonly position: number }
  | { readonly type: 'ice_rezzed'; readonly uid: string; readonly cardId: string }
  | { readonly type: 'ice_encountered'; readonly uid: string }
  /** Inside Job: the encountered ICE is passed without breaking; nothing fires. */
  | { readonly type: 'ice_bypassed'; readonly uid: string }
  /** A breaker's current strength changed (pump, or a boost ending). */
  | { readonly type: 'strength_changed'; readonly uid: string; readonly strength: number }
  | { readonly type: 'subroutine_broken'; readonly iceUid: string; readonly sub: number; readonly breakerUid: string }
  | { readonly type: 'subroutine_fired'; readonly iceUid: string; readonly sub: number }
  | { readonly type: 'clicks_lost'; readonly player: Side; readonly amount: number }
  /** The Runner discarded `cardIds` (face up, to the Heap). */
  | { readonly type: 'net_damage'; readonly amount: number; readonly cardIds: readonly string[] }
  | { readonly type: 'ice_passed'; readonly uid: string }
  | { readonly type: 'run_successful'; readonly server: ServerId }
  /** `cardId` is dropped in the Corp's projection when `from` is 'rd' (deck order is hidden from the Corp too). */
  | { readonly type: 'card_accessed'; readonly cardId?: string; readonly from: AccessFrom; readonly uid?: string }
  | { readonly type: 'agenda_stolen'; readonly cardId: string; readonly points: number }
  | { readonly type: 'card_trashed'; readonly cardId: string; readonly from: AccessFrom; readonly uid?: string }
  | { readonly type: 'run_ended'; readonly server: ServerId; readonly outcome: RunOutcome }
  | { readonly type: 'card_advanced'; readonly uid: string; readonly advancements: number }
  | { readonly type: 'agenda_scored'; readonly uid: string; readonly cardId: string; readonly points: number };
