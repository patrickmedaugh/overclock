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
What `player` is allowed to see. Opponent hand contents and all deck orders are hidden (counts only). The AI and the client render only from this.

## Types (Sprint 0)

```ts
type Side = 'corp' | 'runner';

type Action =
  | { type: 'draw'; player: Side };

type GameEvent =
  | { type: 'card_drawn'; player: Side; cardId?: string } // cardId omitted in opponent's view
  | { type: 'action_rejected'; reason: 'no_clicks' | 'deck_empty' | 'not_your_turn' };
```

`GameState` is plain JSON (serializable). It includes `rng: number` (mulberry32 state), per-side `deck`, `hand`, `credits`, `clicks`, and `activePlayer`.

## Rules for contributors
- Every new action/event is added here and in the sprint tech plan.
- Every action has Vitest tests for its success path and each rejection reason.
- Card behavior belongs in `@overclock/cards` data + the effect DSL, not in engine special cases.
