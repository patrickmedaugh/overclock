import type { ActionOf } from './actions';
import type { ApplyResult } from './apply';
import { runEffects } from './effects';
import type { GameEvent } from './events';
import { pay } from './install';
import { handCard } from './rules';
import { withPlayer, type GameState } from './state';

/**
 * Plays an operation/event: pay, reveal (card_played), resolve its effects,
 * then it goes face up onto the discard pile (card_resolved). The action has
 * passed every check in `rules.ts`.
 */
export function doPlay(state: GameState, a: ActionOf<'play'>): ApplyResult {
  const card = handCard(state, a);
  if (!card) throw new Error('doPlay: unchecked action'); // unreachable after validation
  const events: GameEvent[] = [];
  let s = pay(state, a, card.cost, events);
  const me = s.players[a.player];
  s = withPlayer(s, a.player, { hand: me.hand.filter((_, i) => i !== a.handIndex) });
  events.push({ type: 'card_played', player: a.player, handIndex: a.handIndex, cardId: card.id, cost: card.cost });
  s = runEffects(s, a.player, card.onPlay ?? [], events);
  s = withPlayer(s, a.player, { discard: [...s.players[a.player].discard, { cardId: card.id, faceUp: true }] });
  events.push({ type: 'card_resolved', player: a.player, cardId: card.id });
  return { state: s, events };
}
