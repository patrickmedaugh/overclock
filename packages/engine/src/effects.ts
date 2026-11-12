/**
 * The effect DSL interpreter (`@overclock/cards` Effect). An exhaustive switch
 * over effect ops: no card ids here, card behavior lives in card data.
 */
import type { Effect } from '@overclock/cards';
import type { GameEvent } from './events';
import { drawTop, withPlayer, type GameState, type Side } from './state';

function runEffect(state: GameState, player: Side, effect: Effect, events: GameEvent[]): GameState {
  switch (effect.op) {
    case 'gain_credits': {
      events.push({ type: 'credit_gained', player, amount: effect.amount });
      return withPlayer(state, player, { credits: state.players[player].credits + effect.amount });
    }
    case 'draw': {
      // A short deck gives fewer cards and never loses the game (RULES_SPEC).
      let s = state;
      const n = Math.min(effect.count, s.players[player].deck.length);
      for (let i = 0; i < n; i++) {
        const drawn = drawTop(s, player);
        s = drawn.state;
        events.push({ type: 'card_drawn', player, cardId: drawn.cardId });
      }
      return s;
    }
    default: {
      const unknown: never = effect;
      throw new Error(`unknown effect ${JSON.stringify(unknown)}`);
    }
  }
}

/** Resolves `effects` in order for `player`, appending their events. */
export function runEffects(state: GameState, player: Side, effects: readonly Effect[], events: GameEvent[]): GameState {
  return effects.reduce((s, e) => runEffect(s, player, e, events), state);
}
