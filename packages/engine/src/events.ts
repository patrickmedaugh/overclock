import type { Side } from './state';

export type RejectReason = 'no_clicks' | 'deck_empty' | 'not_your_turn' | 'invalid_action';

export type GameEvent =
  /** cardId is omitted in the opponent's projection (see viewEvents). */
  | { readonly type: 'card_drawn'; readonly player: Side; readonly cardId?: string }
  | { readonly type: 'action_rejected'; readonly reason: RejectReason };
