import type { GameState } from '../src/index';

/** Recursively freezes a value so any mutation throws in strict mode. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/** Returns a copy of `state` with the Runner's clicks set (test setup only). */
export function withRunnerClicks(state: GameState, clicks: number): GameState {
  return { ...state, players: { ...state.players, runner: { ...state.players.runner, clicks } } };
}

export function withRunnerDeck(state: GameState, deck: string[]): GameState {
  return { ...state, players: { ...state.players, runner: { ...state.players.runner, deck } } };
}

/** Deep copy via JSON (GameState is plain JSON by contract). */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
