import { apply, type Action, type GameEvent, type GameState, type PlayerState, type Side } from '../src/index';

/** Recursively freezes a value so any mutation throws in strict mode. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/** Returns a copy of `state` with one player's fields replaced (test setup only). */
export function withPlayer(state: GameState, side: Side, patch: Partial<PlayerState>): GameState {
  return { ...state, players: { ...state.players, [side]: { ...state.players[side], ...patch } } };
}

export function withClicks(state: GameState, side: Side, clicks: number): GameState {
  return withPlayer(state, side, { clicks });
}

export function withDeck(state: GameState, side: Side, deck: string[]): GameState {
  return withPlayer(state, side, { deck });
}

export function withHand(state: GameState, side: Side, hand: string[]): GameState {
  return withPlayer(state, side, { hand });
}

/** Discard pile entries (state shape). */
export const up = (cardId: string) => ({ cardId, faceUp: true });
export const down = (cardId: string) => ({ cardId, faceUp: false });

/** Deep copy via JSON (GameState is plain JSON by contract). */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Applies actions in order, asserting none is rejected. Returns final state and all events. */
export function run(state: GameState, actions: readonly Action[]): { state: GameState; events: GameEvent[] } {
  let s = state;
  const events: GameEvent[] = [];
  for (const a of actions) {
    const r = apply(s, a);
    const rejected = r.events.find((e) => e.type === 'action_rejected');
    if (rejected) throw new Error(`unexpected rejection of ${JSON.stringify(a)}: ${JSON.stringify(rejected)}`);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

export const endTurn = (player: Side): Action => ({ type: 'end_turn', player });
export const draw = (player: Side): Action => ({ type: 'draw', player });
export const gainCredit = (player: Side): Action => ({ type: 'gain_credit', player });
export const discard = (player: Side, handIndices: number[]): Action => ({ type: 'discard', player, handIndices });

/**
 * Ends the active player's turn, discarding the first N hand cards if the hand
 * limit asks for it. Returns the new state and all events.
 */
export function finishTurn(state: GameState): { state: GameState; events: GameEvent[] } {
  const p = state.activePlayer;
  const ended = run(state, [endTurn(p)]);
  if (ended.state.phase !== 'discard') return ended;
  const n = ended.state.players[p].hand.length - 5;
  const done = run(ended.state, [discard(p, Array.from({ length: n }, (_, i) => i))]);
  return { state: done.state, events: [...ended.events, ...done.events] };
}

/** The single rejection reason from an apply result, or null if accepted. */
export function rejection(events: readonly GameEvent[]): string | null {
  const e = events.find((x) => x.type === 'action_rejected');
  return e && e.type === 'action_rejected' ? e.reason : null;
}
