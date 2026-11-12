import type { Side, WinReason } from './state';

/** Why an action was refused. Order of checks: see `rules.ts`. */
export type RejectReason =
  | 'invalid_action'
  | 'game_over'
  | 'not_your_turn'
  | 'wrong_phase'
  | 'no_clicks'
  | 'deck_empty'
  | 'bad_discard';

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
  | { readonly type: 'action_rejected'; readonly reason: RejectReason };
