/**
 * Hand options: for each hand card, the places it can go, priced by the
 * engine. Computed with the validation table in `rules.ts`, so the client
 * needs no rules of its own. Places that fail a structural check (the card can
 * never go there: bad_target, slot_taken) are left out; places blocked only
 * for now (no_clicks, no_credits, no_memory, needs_runs) are listed with the reason.
 */
import { getCard } from '@overclock/cards';
import type { Action, ActionOf } from './actions';
import { handCard, installCost, rejectionFor, structuralRejection } from './rules';
import type { GameState, Side } from './state';
import type { HandOption, PlaceOption } from './view';

type Candidate = { readonly place: PlaceOption['place']; readonly action: ActionOf<'install' | 'play'> };

function candidates(state: GameState, player: Side, handIndex: number): Candidate[] {
  const card = getCard(state.players[player].hand[handIndex] ?? '');
  if (!card) return [];
  if (card.type === 'operation' || card.type === 'event') {
    return [{ place: 'play', action: { type: 'play', player, handIndex } }];
  }
  if (player === 'runner') return [{ place: 'rig', action: { type: 'install', player, handIndex } }];
  const targets = [...state.players.corp.servers.map((s) => s.id), 'new' as const];
  return targets.map((server) => ({ place: server, action: { type: 'install', player, handIndex, server } }));
}

function cost(state: GameState, action: ActionOf<'install' | 'play'>): number {
  return action.type === 'install' ? installCost(state, action) : (handCard(state, action)?.cost ?? 0);
}

/** One entry per hand card (in hand order) for the active player in the action phase; otherwise []. */
export function handOptions(state: GameState, player: Side): HandOption[] {
  if (state.phase !== 'action' || state.activePlayer !== player) return [];
  return state.players[player].hand.map((_, handIndex) => ({
    handIndex,
    places: candidates(state, player, handIndex)
      .filter((c) => structuralRejection(state, c.action) === null)
      .map((c) => ({ place: c.place, cost: cost(state, c.action), action: c.action, reason: rejectionFor(state, c.action) })),
  }));
}

/** Every legal install/play action, in hand order then place order. */
export function legalHandActions(state: GameState, player: Side): Action[] {
  return handOptions(state, player).flatMap((o) => o.places.filter((p) => p.reason === null).map((p) => p.action));
}
