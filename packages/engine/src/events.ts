import type { Effect } from '@overclock/cards';
import type { AccessFrom, ChoiceKind, ServerId, Side, WinReason } from './state';

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

/** How a run ended. `access_replaced` (Sprint 7): a `replacesAccess` ability (Bank Job) was used instead of access. */
export type RunOutcome = 'accessed' | 'jacked_out' | 'ended_by_ice' | 'flatline' | 'access_replaced';

/**
 * Sprint 7: what made a card ability happen. Sprint 8: `install` ("the first time you install a card
 * each turn", e.g. the Haas-Bioroid identity), `install_discount` (an install got cheaper, e.g. Kate;
 * only when it lowered the price), `rez` (a card's "when rezzed" effect).
 */
export type AbilityTrigger = 'click' | 'turn_start' | 'successful_run' | 'install' | 'install_discount' | 'rez';

export type InstallZone = 'ice' | 'content' | 'rig';

/**
 * Sprint 5: what one fired subroutine actually did. `amount` = the actual size:
 * clicks really lost ("if able", may be 0), net damage dealt (printed), credits
 * gained, cards drawn; 0 for `end_run`.
 */
export interface SubOutcome {
  readonly sub: number;
  readonly op: Effect['op'];
  readonly amount: number;
}

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
  /**
   * Only when amount > 0. `temp` (Sprint 4, only when > 0): the part of `amount` paid from
   * the Runner's run-only credits. `hosted` (Sprint 7, only when > 0): the part paid from credits
   * on cards (recurring credits; each card's new total follows in `hosted_credits_changed`).
   * The rest came from `player`'s credits.
   */
  | { readonly type: 'credits_spent'; readonly player: Side; readonly amount: number; readonly temp?: number; readonly hosted?: number }
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
  /**
   * Sprint 5: right after a fired subroutine's own effect events (after `clicks_lost` /
   * `net_damage`, before `run_ended` / `game_over`). Public: the ICE is rezzed.
   */
  | { readonly type: 'subroutine_resolved'; readonly iceUid: string; readonly cardId: string; readonly outcome: SubOutcome }
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
  | { readonly type: 'agenda_scored'; readonly uid: string; readonly cardId: string; readonly points: number }
  // ---- Sprint 4: "when scored" bonuses, bad publicity (all public) ----
  /** The Corp took `amount` bad publicity; `total` is its new bad publicity. */
  | { readonly type: 'bad_publicity_gained'; readonly amount: number; readonly total: number }
  /**
   * A choice opened (phase 'choice'); `cardId` = the card whose effect opened it (Sprint 8: the
   * rezzed ICE for `trash_target` / `prevent_trash`). `target` (Sprint 8, `prevent_trash` only):
   * the rig card that would be trashed.
   */
  | { readonly type: 'choice_opened'; readonly kind: ChoiceKind; readonly player: Side; readonly cardId: string; readonly target?: string }
  /** The choice was answered: `skipped` = the player chose Skip. */
  | { readonly type: 'choice_closed'; readonly kind: ChoiceKind; readonly skipped: boolean }
  /** Right after `run_started` (only when > 0): run-only credits from bad publicity. */
  | { readonly type: 'temp_credits_gained'; readonly amount: number }
  /** Right before `run_ended` (only when > 0): the unspent run-only credits vanish. */
  | { readonly type: 'temp_credits_lost'; readonly amount: number }
  // ---- Sprint 7: card abilities, hosted credits, rezzing assets/upgrades, empty remotes (all public) ----
  /** The Corp rezzed an asset/upgrade in its action phase (after `credits_spent`). ICE keeps `ice_rezzed`. */
  | { readonly type: 'card_rezzed'; readonly uid: string; readonly cardId: string; readonly server: ServerId }
  /** A card ability happens (before its effect's events). The card is face up. */
  | { readonly type: 'ability_triggered'; readonly uid: string; readonly cardId: string; readonly trigger: AbilityTrigger }
  /** Credits on installed card `uid` changed; `credits` = the new total (install, take, spend, refill). */
  | { readonly type: 'hosted_credits_changed'; readonly uid: string; readonly credits: number }
  /**
   * A Runner card left the rig for the Heap (face up), e.g. Armitage Codebusting emptied.
   * Sprint 9: `cause: 'tagged'` = the Corp's `trash_resource` basic action.
   */
  | { readonly type: 'rig_card_trashed'; readonly uid: string; readonly cardId: string; readonly cause?: 'tagged' }
  /** An empty remote (no ICE, no cards) was removed (after `run_ended`, or at the end of a score). Its id is never reused. */
  | { readonly type: 'server_removed'; readonly server: ServerId }
  // ---- Sprint 8: identities, brain damage, Corp trashes, trash prevention (all public) ----
  /** `player` gained `amount` clicks (Biotic Labor). */
  | { readonly type: 'clicks_gained'; readonly player: Side; readonly amount: number }
  /**
   * Brain damage to the Runner: `amount` taken (the hand size drops by it first), `cardIds` = the
   * random Grip cards that went face up to the Heap, `maxHandSize` = the new maximum.
   */
  | { readonly type: 'brain_damage'; readonly amount: number; readonly cardIds: readonly string[]; readonly maxHandSize: number }
  /** A face-up Corp card left its server for Archives, face up (e.g. Adonis Campaign emptied). */
  | { readonly type: 'corp_card_trashed'; readonly uid: string; readonly cardId: string; readonly server: ServerId }
  /** Rig card `uid` was not trashed: preventer `byUid` was trashed instead (its `rig_card_trashed` comes first). */
  | { readonly type: 'trash_prevented'; readonly uid: string; readonly cardId: string; readonly byUid: string; readonly byCardId: string }
  // ---- Sprint 9: traces, tags, meat damage (all public) ----
  /** A trace begins: `cardId` = the ICE or operation, `base` = printed strength, `link` = the Runner's link now. */
  | { readonly type: 'trace_started'; readonly cardId: string; readonly base: number; readonly link: number }
  /**
   * A trace bid (after its `credits_spent`, if any). `total` = the trace strength for the Corp,
   * link + bid for the Runner. `auto` (only when true) = the window was skipped (the bid could not matter).
   */
  | { readonly type: 'trace_bid'; readonly player: Side; readonly credits: number; readonly total: number; readonly auto?: true }
  /** The trace is over: `strength` (Corp) vs `total` (Runner link + bid); `success` iff strength > total. */
  | { readonly type: 'trace_resolved'; readonly cardId: string; readonly strength: number; readonly total: number; readonly success: boolean }
  /** The Runner's tags changed by `amount` (+n given, −1 removed); `tags` = the new total. */
  | { readonly type: 'tags_changed'; readonly amount: number; readonly tags: number }
  /** Meat damage to the Runner: `cardIds` = the random Grip cards that went face up to the Heap. */
  | { readonly type: 'meat_damage'; readonly amount: number; readonly cardIds: readonly string[] };
