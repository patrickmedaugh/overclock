import type { Action, ActionOf } from './actions';
import type { GameEvent } from './events';
import { discardCount, rejectionFor } from './rules';
import { drawTop, opponentOf, startTurn, withPlayer, type GameState, type Side } from './state';

export interface ApplyResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

/** Ends the active player's turn and starts the opponent's. */
function passTurn(state: GameState, events: GameEvent[]): ApplyResult {
  const ending = state.activePlayer;
  events.push({ type: 'turn_ended', player: ending });
  const started = startTurn(state, opponentOf(ending), state.turn + 1);
  events.push(...started.events);
  return { state: started.state, events };
}

function doDraw(state: GameState, a: ActionOf<'draw'>): ApplyResult {
  const drawn = drawTop(state, a.player);
  const s = withPlayer(drawn.state, a.player, { clicks: state.players[a.player].clicks - 1 });
  return { state: s, events: [{ type: 'card_drawn', player: a.player, cardId: drawn.cardId }] };
}

function doGainCredit(state: GameState, a: ActionOf<'gain_credit'>): ApplyResult {
  const me = state.players[a.player];
  const s = withPlayer(state, a.player, { credits: me.credits + 1, clicks: me.clicks - 1 });
  return { state: s, events: [{ type: 'credit_gained', player: a.player, amount: 1 }] };
}

function doEndTurn(state: GameState, a: ActionOf<'end_turn'>): ApplyResult {
  // Leftover clicks are lost (house rule: ending early is allowed).
  const s = withPlayer(state, a.player, { clicks: 0 });
  const count = discardCount(s.players[a.player].hand.length);
  if (count > 0) {
    return { state: { ...s, phase: 'discard' }, events: [{ type: 'discard_required', player: a.player, count }] };
  }
  return passTurn(s, []);
}

function doDiscard(state: GameState, a: ActionOf<'discard'>): ApplyResult {
  const me = state.players[a.player];
  const handIndices = [...a.handIndices].sort((x, y) => x - y);
  const chosen = new Set(handIndices);
  const cardIds = handIndices.map((i) => me.hand[i] as string);
  const s = withPlayer(state, a.player, {
    hand: me.hand.filter((_, i) => !chosen.has(i)),
    // Runner discards go face up to the Heap; the Corp's go face down to Archives.
    discard: [...me.discard, ...cardIds.map((cardId) => ({ cardId, faceUp: a.player === 'runner' }))],
  });
  const events: GameEvent[] = [
    { type: 'cards_discarded', player: a.player, count: cardIds.length, handIndices, cardIds },
  ];
  return passTurn(s, events);
}

/**
 * Applies one action. Pure: never mutates `state`, never throws for illegal or
 * malformed actions (returns the same state plus an `action_rejected` event).
 */
export function apply(state: GameState, action: Action): ApplyResult {
  const reason = rejectionFor(state, action);
  if (reason) return { state, events: [{ type: 'action_rejected', reason }] };

  switch (action.type) {
    case 'draw':
      return doDraw(state, action);
    case 'gain_credit':
      return doGainCredit(state, action);
    case 'end_turn':
      return doEndTurn(state, action);
    case 'discard':
      return doDiscard(state, action);
    case 'install':
    case 'play':
      return { state, events: [{ type: 'action_rejected', reason: 'bad_card' }] };
  }
}

/**
 * All actions `player` may take right now, in a stable order. `discard` has too
 * many combinations to list, so one representative (the last N hand cards) is
 * listed; `PlayerView.pendingDiscard` says any N distinct indices are legal.
 */
export function legalActions(state: GameState, player: Side): Action[] {
  if (player !== 'corp' && player !== 'runner') return [];
  const handSize = state.players[player].hand.length;
  const n = discardCount(handSize);
  const candidates: Action[] = [
    { type: 'draw', player },
    { type: 'gain_credit', player },
    { type: 'end_turn', player },
    { type: 'discard', player, handIndices: Array.from({ length: n }, (_, k) => handSize - n + k) },
  ];
  return candidates.filter((a) => rejectionFor(state, a) === null);
}
