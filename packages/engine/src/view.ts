import type { Action } from './actions';
import { legalActions } from './apply';
import type { GameEvent } from './events';
import type { GameState, PlayerState, Side } from './state';

export interface PlayerSideView {
  readonly deckCount: number;
  readonly handCount: number;
  /** Card ids in hand, only for the viewing player; null for the opponent. */
  readonly hand: readonly string[] | null;
  readonly credits: number;
  readonly clicks: number;
}

/** What one player may see. Deck order is never included. */
export interface PlayerView {
  readonly viewer: Side;
  readonly turn: number;
  readonly activePlayer: Side;
  readonly players: { readonly corp: PlayerSideView; readonly runner: PlayerSideView };
  /** Actions the viewer may take now (so the AI/client never need the full state). */
  readonly legalActions: readonly Action[];
}

function sideView(p: PlayerState, visible: boolean): PlayerSideView {
  return {
    deckCount: p.deck.length,
    handCount: p.hand.length,
    hand: visible ? p.hand.slice() : null,
    credits: p.credits,
    clicks: p.clicks,
  };
}

export function viewFor(player: Side, state: GameState): PlayerView {
  return {
    viewer: player,
    turn: state.turn,
    activePlayer: state.activePlayer,
    players: {
      corp: sideView(state.players.corp, player === 'corp'),
      runner: sideView(state.players.runner, player === 'runner'),
    },
    legalActions: legalActions(state, player),
  };
}

/** Projects events for `player`, hiding information they may not see. */
export function viewEvents(player: Side, events: readonly GameEvent[]): GameEvent[] {
  return events.map((e) => {
    if (e.type === 'card_drawn' && e.player !== player) {
      return { type: 'card_drawn', player: e.player };
    }
    return e;
  });
}
