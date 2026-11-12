import type { ServerId, Side } from './state';

/**
 * Everything a player can ask the engine to do. Plain JSON. New actions must be
 * added to the validation table in `rules.ts` (a missing entry is a type error),
 * the README and the sprint tech plan.
 */
export type Action =
  /** 1 click: top card of your deck to your hand. */
  | { readonly type: 'draw'; readonly player: Side }
  /** 1 click: +1 credit. */
  | { readonly type: 'gain_credit'; readonly player: Side }
  /** Ends your turn; leftover clicks are lost. Hand > 5 enters the discard step first. */
  | { readonly type: 'end_turn'; readonly player: Side }
  /** Hand-limit step only: indices into the current hand (exactly hand - 5 of them). */
  | { readonly type: 'discard'; readonly player: Side; readonly handIndices: readonly number[] }
  /**
   * 1 click: install the hand card at `handIndex`. Corp: `server` is required (an existing
   * server id or 'new'). Runner: `server` must be absent (cards go to the rig).
   */
  | { readonly type: 'install'; readonly player: Side; readonly handIndex: number; readonly server?: ServerId | 'new' }
  /** 1 click: play the operation/event at `handIndex` (pays its cost, resolves `onPlay`, goes face up to discard). */
  | { readonly type: 'play'; readonly player: Side; readonly handIndex: number };

export type ActionType = Action['type'];

/** Narrows `Action` to one action type. */
export type ActionOf<T extends ActionType> = Extract<Action, { type: T }>;
