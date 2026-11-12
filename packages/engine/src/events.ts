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
  /** install/play: hand index out of range, or the card can't be installed/played that way. */
  | 'bad_card'
  /** install: Runner named a server; Corp named none/an unknown one; agenda/asset to a central. */
  | 'bad_target'
  /** install: the remote already holds an agenda or asset. */
  | 'slot_taken'
  /** install: the program needs more memory than is free. */
  | 'no_memory'
  /** install/play: not enough credits. */
  | 'no_credits'
  /** play: the card needs runs, which are not built yet. */
  | 'needs_runs';

/** Where an installed card sits. Corp: 'ice' | 'root'. Runner: the rig row. */
export type InstallSlot = 'ice' | 'root' | 'program' | 'hardware' | 'resource';

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
  /** The Corp opened a new remote server (`remote` is its number: "Server N"). */
  | { readonly type: 'server_created'; readonly serverId: ServerId; readonly remote: number }
  /** Only when amount > 0; comes before the install/play it pays for. */
  | { readonly type: 'credits_spent'; readonly player: Side; readonly amount: number }
  | {
      readonly type: 'card_installed';
      readonly player: Side;
      readonly uid: string;
      /** Index in the hand before installing. Owner only. */
      readonly handIndex?: number;
      /** Hidden from the Runner for Corp installs (face down). */
      readonly cardId?: string;
      /** Corp installs only. */
      readonly server?: ServerId;
      readonly slot: InstallSlot;
      /** Position in the slot's list (ICE: 0 innermost, the new card is outermost). */
      readonly index: number;
    }
  /** Public (the card is revealed), except handIndex, which is owner only. */
  | { readonly type: 'card_played'; readonly player: Side; readonly handIndex?: number; readonly cardId: string; readonly cost: number }
  /** The played card finished resolving and is now face up on its owner's discard pile. */
  | { readonly type: 'card_resolved'; readonly player: Side; readonly cardId: string };
