import type { ServerId, Side, WinReason } from './state';

/** Why an action was refused. Order of checks: see `rules.ts`. */
export type RejectReason =
  | 'invalid_action'
  | 'game_over'
  | 'not_your_turn'
  | 'wrong_phase'
  | 'no_clicks'
  | 'deck_empty'
  | 'bad_discard'
  /** install/play: hand index out of range, or the card is the wrong type for the action. */
  | 'bad_card'
  /** install: the server is missing, unknown or not allowed for this card (or a Runner named one). */
  | 'bad_target'
  /** The card needs a system that is not built yet (runs). */
  | 'not_implemented'
  | 'no_credits'
  | 'no_memory';

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
  /** Credits paid for an install or play (only when amount > 0). */
  | { readonly type: 'credits_spent'; readonly player: Side; readonly amount: number }
  /** The Corp opened a new remote server (before the card_installed that fills it). */
  | { readonly type: 'server_created'; readonly server: ServerId }
  /**
   * A card was installed. `server` for Corp installs. The opponent's projection
   * drops `handIndex`, and drops `cardId` for Corp installs (face down).
   */
  | {
      readonly type: 'card_installed';
      readonly player: Side;
      readonly uid: string;
      readonly zone: InstallZone;
      readonly server?: ServerId;
      readonly handIndex?: number;
      readonly cardId?: string;
    }
  /** An operation/event was played (face up). Its effects' events follow. Opponent loses `handIndex`. */
  | { readonly type: 'card_played'; readonly player: Side; readonly cardId: string; readonly handIndex?: number };

export type InstallZone = 'ice' | 'content' | 'rig';
