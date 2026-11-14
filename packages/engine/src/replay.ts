import type { Action } from './actions';
import { apply } from './apply';
import type { GameEvent } from './events';
import { newGame, type GameOptions, type GameState } from './state';

/**
 * Rebuilds a game from (seed, actions[]). Rejected actions stay in the log as
 * no-ops. `options` must be the ones the game was created with. Used for replay-based regression tests and debugging.
 */
export function replay(
  seed: number,
  actions: readonly Action[],
  options?: Partial<GameOptions>,
): { state: GameState; events: GameEvent[] } {
  let state = newGame(seed, options);
  const events: GameEvent[] = [];
  for (const action of actions) {
    const r = apply(state, action);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}
