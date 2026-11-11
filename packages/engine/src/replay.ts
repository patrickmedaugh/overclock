import type { Action } from './actions';
import { apply } from './apply';
import type { GameEvent } from './events';
import { newGame, type GameState } from './state';

/**
 * Rebuilds a game from (seed, actions[]). Rejected actions stay in the log as
 * no-ops. Used for replay-based regression tests and debugging.
 */
export function replay(seed: number, actions: readonly Action[]): { state: GameState; events: GameEvent[] } {
  let state = newGame(seed);
  const events: GameEvent[] = [];
  for (const action of actions) {
    const r = apply(state, action);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}
