# @overclock/engine

The rules engine. Pure and deterministic: `(state, action) -> { state, events }`. No DOM, no timers, no `Math.random`; all randomness comes from a seeded RNG stored in the state. Implements `docs/RULES_SPEC.md`.

Keep this public API small. Anything not exported from `src/index.ts` is internal.

## Public API

### `newGame(seed: number): GameState`
Creates a new game. Same seed always gives the same shuffled decks and opening hands.

### `apply(state: GameState, action: Action): { state: GameState; events: GameEvent[] }`
Applies one action. Never mutates the input and never throws for illegal actions: it returns the unchanged state plus an `action_rejected` event.

### `legalActions(state: GameState, player: Side): Action[]`
All actions `player` may take right now. The client uses it to highlight; the AI picks from it.

### `viewFor(player: Side, state: GameState): PlayerView`
What `player` is allowed to see. Opponent hand contents and all deck orders are hidden (counts only). The AI and the client render only from this. Includes `legalActions` for the viewer so consumers never need the full state.

### `viewEvents(player: Side, events: GameEvent[]): GameEvent[]`
Projects events for `player`: an opponent's `card_drawn` loses its `cardId`. Run engine events through this before animating them for a player.

### `replay(seed: number, actions: Action[]): { state; events }`
Rebuilds a game from its seed and action log (rejected actions are no-ops). Used for replay-based regression tests.

## Types (Sprint 0)

```ts
type Side = 'corp' | 'runner';

type Action =
  | { type: 'draw'; player: Side };

type GameEvent =
  | { type: 'card_drawn'; player: Side; cardId?: string } // cardId omitted in opponent's view
  | { type: 'action_rejected'; reason: 'no_clicks' | 'deck_empty' | 'not_your_turn' | 'invalid_action' };

interface PlayerView {
  viewer: Side;
  turn: number;
  activePlayer: Side;
  players: Record<Side, {
    deckCount: number; handCount: number;
    hand: string[] | null; // card ids; null for the opponent
    credits: number; clicks: number;
  }>;
  legalActions: Action[];
}
```

`GameState` is plain JSON (serializable). It includes `seed`, `rng: number` (mulberry32 state), `turn`, `activePlayer`, and `players.{corp,runner}` with `deck` (top = index 0), `hand`, `credits`, `clicks`. Card entries are card definition ids from `@overclock/cards` (look them up with `getCard(id)`); duplicates are extra copies.

Rejection checks run in this order: `invalid_action` (malformed input), `not_your_turn`, `no_clicks`, `deck_empty`.

## Rules for contributors
- Every new action/event is added here and in the sprint tech plan.
- Every action has Vitest tests for its success path and each rejection reason.
- Card behavior belongs in `@overclock/cards` data + the effect DSL, not in engine special cases.
