import type { Action } from './actions';
import type { GameEvent, RejectReason } from './events';
import type { GameState, PlayerState, Side } from './state';

export interface ApplyResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

function reject(state: GameState, reason: RejectReason): ApplyResult {
  return { state, events: [{ type: 'action_rejected', reason }] };
}

function isSide(x: unknown): x is Side {
  return x === 'corp' || x === 'runner';
}

function withPlayer(state: GameState, side: Side, player: PlayerState): GameState {
  return { ...state, players: { ...state.players, [side]: player } };
}

/** Why `action` is illegal right now, or null if it is legal. Checked in this order. */
export function rejectionFor(state: GameState, action: Action): RejectReason | null {
  switch (action.type) {
    case 'draw': {
      const me = state.players[action.player];
      if (state.activePlayer !== action.player) return 'not_your_turn';
      if (me.clicks <= 0) return 'no_clicks';
      if (me.deck.length === 0) return 'deck_empty';
      return null;
    }
  }
}

/**
 * Applies one action. Pure: never mutates `state`, never throws for illegal or
 * malformed actions (returns the same state plus an `action_rejected` event).
 */
export function apply(state: GameState, action: Action): ApplyResult {
  // Actions may arrive as untyped JSON (client, replays): validate the shape.
  const raw = action as unknown as { type?: unknown; player?: unknown } | null;
  if (typeof raw !== 'object' || raw === null || raw.type !== 'draw' || !isSide(raw.player)) {
    return reject(state, 'invalid_action');
  }

  const reason = rejectionFor(state, action);
  if (reason) return reject(state, reason);

  switch (action.type) {
    case 'draw': {
      const me = state.players[action.player];
      const [cardId, ...rest] = me.deck as [string, ...string[]];
      const next = withPlayer(state, action.player, {
        ...me,
        deck: rest,
        hand: [...me.hand, cardId],
        clicks: me.clicks - 1,
      });
      return { state: next, events: [{ type: 'card_drawn', player: action.player, cardId }] };
    }
  }
}

/** All actions `player` may take right now. */
export function legalActions(state: GameState, player: Side): Action[] {
  const candidates: Action[] = [{ type: 'draw', player }];
  return candidates.filter((a) => rejectionFor(state, a) === null);
}
