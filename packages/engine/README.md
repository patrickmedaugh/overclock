# @overclock/engine

The rules engine. Pure and deterministic: `(state, action) -> { state, events }`. No DOM, no timers, no `Math.random`; all randomness comes from a seeded RNG stored in the state. Implements `docs/RULES_SPEC.md`.

Keep this public API small. Anything not exported from `src/index.ts` is internal. State, actions and events are plain JSON so a game server can store, send and replay them.

## Public API

### `newGame(seed: number): GameState`
Creates a new game. Same seed always gives the same shuffled decks and opening hands. The game starts on turn 1, the Corp's turn: Corp has 3 clicks and has already taken its mandatory start-of-turn draw (6 cards in hand). The Runner has 0 clicks.

### `apply(state: GameState, action: Action): { state: GameState; events: GameEvent[] }`
Applies one action. Never mutates the input and never throws for illegal or malformed actions: it returns the unchanged state plus an `action_rejected` event.

### `legalActions(state: GameState, player: Side): Action[]`
Actions `player` may take right now. Parameterized actions are listed once as a representative: during the discard step it contains one `discard` (the last N hand cards), and `PlayerView.pendingDiscard` says that any N distinct hand indices are legal.

### `viewFor(player: Side, state: GameState): PlayerView`
What `player` is allowed to see. Opponent hand contents, all deck orders, the Corp's face-down discards and unrezzed installed Corp cards (to the Runner) are hidden. The AI and the client render only from this. Includes `legalActions` for the viewer.

### `viewEvents(player: Side, events: GameEvent[]): GameEvent[]`
Projects events for `player`. For the opponent: `card_drawn` loses `cardId`, `cards_discarded` loses `handIndices`, and it also loses `cardIds` when the Corp discarded (face down); `card_installed`/`card_played` lose `handIndex`, and Corp `card_installed` also loses `cardId`. Run engine events through this before showing them to a player.

### `replay(seed: number, actions: Action[]): { state; events }`
Rebuilds a game from its seed and action log (rejected actions are no-ops). Used for replay-based regression tests.

## Sprint 1 interface (pinned: implement exactly this; changes go through the architect)

```ts
type Side = 'corp' | 'runner';
type Phase = 'action' | 'discard' | 'over';
type WinReason = 'corp_decked';

type Action =
  | { type: 'draw'; player: Side }          // 1 click: top card to hand
  | { type: 'gain_credit'; player: Side }   // 1 click: +1 credit
  | { type: 'end_turn'; player: Side }      // leftover clicks are lost
  | { type: 'discard'; player: Side; handIndices: number[] }; // hand-limit step only

type RejectReason =
  | 'invalid_action' | 'game_over' | 'not_your_turn' | 'wrong_phase'
  | 'no_clicks' | 'deck_empty' | 'bad_discard';

type GameEvent =
  | { type: 'card_drawn'; player: Side; cardId?: string }            // cardId hidden from opponent
  | { type: 'credit_gained'; player: Side; amount: number }
  | { type: 'discard_required'; player: Side; count: number }
  | { type: 'cards_discarded'; player: Side; count: number;
      handIndices?: number[];  // ascending, indices into the hand before discarding; owner only
      cardIds?: string[] }     // same order; hidden from the Runner when the Corp discards
  | { type: 'turn_ended'; player: Side }
  | { type: 'turn_started'; player: Side; turn: number; clicks: number }
  | { type: 'game_over'; winner: Side; reason: WinReason }
  | { type: 'action_rejected'; reason: RejectReason };

interface PlayerSideView {
  deckCount: number;
  handCount: number;
  hand: string[] | null;     // null for the opponent
  credits: number;
  clicks: number;
  discardCount: number;
  discard: string[] | null;  // bottom = index 0; null when face down to the viewer
}

interface PlayerView {
  viewer: Side;
  turn: number;              // counts player-turns: Corp 1, Runner 2, Corp 3, ...
  activePlayer: Side;
  phase: Phase;
  pendingDiscard: number;    // > 0 only for the active viewer during 'discard'
  result: { winner: Side; reason: WinReason } | null;
  players: Record<Side, PlayerSideView>;
  legalActions: Action[];
}
```

### Event sequences
- `draw` → `card_drawn`. `gain_credit` → `credit_gained`.
- `end_turn`, hand ≤ 5 → `turn_ended`, `turn_started`, then for a Corp turn `card_drawn` (or `game_over` if its deck is empty).
- `end_turn`, hand > 5 → `discard_required{count}` (clicks set to 0, `phase='discard'`). Then `discard` → `cards_discarded`, `turn_ended`, `turn_started`, ... as above.

### Validation (`src/rules.ts`, one table used by `apply` and `legalActions`)
Checks run in this order; the first failure is the reason: `invalid_action` (shape: known type, valid `player`, `handIndices` an array of integers) → `game_over` (phase is `over`) → `not_your_turn` → `wrong_phase` (draw/gain_credit/end_turn need `action`, discard needs `discard`) → `no_clicks` (draw, gain_credit) → `deck_empty` (draw) / `bad_discard` (discard: not exactly hand−5 indices, duplicates, or out of range).

`GameState` is plain JSON: `seed`, `rng` (mulberry32 state), `turn`, `activePlayer`, `phase`, `result`, and `players.{corp,runner}` with `deck` (top = index 0), `hand`, `discard`, `credits`, `clicks`. Card entries are card definition ids from `@overclock/cards` (`getCard(id)`); duplicates are extra copies.

## Sprint 2 interface (pinned: implement exactly this; changes go through the architect)

Everything in "Sprint 1 interface" still holds, except `PlayerSideView.discard` (below).

```ts
const MEMORY_LIMIT = 4;                       // Runner memory; programs use card `memory`
type CentralServerId = 'hq' | 'rd' | 'archives';
type ServerId = CentralServerId | `remote${number}`;

// ---- state additions (plain JSON) ----
interface Installed { uid: string; cardId: string; rezzed: boolean }   // uid "i1", "i2", ... (rezzed: false this sprint)
interface Server { id: ServerId; ice: Installed[]; content: Installed[] } // ice[0] innermost; new ICE pushed = outermost
interface DiscardEntry { cardId: string; faceUp: boolean }
// PlayerState.discard: DiscardEntry[]            (was string[])
// GameState.servers: Server[]   hq, rd, archives, then remote1, remote2, ... in creation order
// GameState.rig: Installed[]    Runner installs, in order
// GameState.nextUid: number     next uid is `i${nextUid}` (starts at 1)
// GameState.nextRemote: number  next remote is `remote${nextRemote}` (starts at 1, never reused)

// ---- actions ----
type Action = /* Sprint 1 actions */
  | { type: 'install'; player: Side; handIndex: number; server?: ServerId | 'new' } // Corp: server required; Runner: absent
  | { type: 'play'; player: Side; handIndex: number };                             // operation / event

type RejectReason = /* Sprint 1 reasons */
  | 'bad_card' | 'bad_target' | 'not_implemented' | 'no_credits' | 'no_memory';

// ---- events ----
type GameEvent = /* Sprint 1 events */
  | { type: 'credits_spent'; player: Side; amount: number }            // only when amount > 0
  | { type: 'server_created'; server: ServerId }
  | { type: 'card_installed'; player: Side; uid: string; zone: 'ice' | 'content' | 'rig';
      server?: ServerId;      // Corp installs
      handIndex?: number;     // owner only
      cardId?: string }       // owner only for Corp installs; public for Runner installs
  | { type: 'card_played'; player: Side; cardId: string; handIndex?: number }; // handIndex owner only

// ---- view ----
interface PlayerSideView { /* ... */ discard: (string | null)[] }   // null = face down to the viewer
interface InstalledView { uid: string; cardId: string | null; faceUp: boolean } // Runner sees null for unrezzed Corp cards
interface ServerView { id: ServerId; ice: InstalledView[]; content: InstalledView[] }
interface CardOption { action: Action; cost: number; reject: RejectReason | null }
interface PlayerView {
  /* Sprint 1 fields */
  corpServers: ServerView[];
  rig: InstalledView[];                       // face up to both
  memory: { used: number; limit: number };
  handOptions: CardOption[][];                // one list per viewer hand index
}
```

### Install / play rules (`rules.ts` table)
- Checks in order: `invalid_action` (shape: `handIndex` integer, `server` absent or a string) → `game_over` → `not_your_turn` → `wrong_phase` (needs `action`) → `no_clicks` → `bad_card` (hand index out of range, or a card type the action does not take) → `bad_target` → `not_implemented` (card `needs: 'runs'`) → `no_credits` → `no_memory` (programs only).
- `install` takes Corp agenda/asset/upgrade/ICE and Runner program/hardware/resource; `play` takes operations/events.
- Corp targets: agenda/asset → a remote with no agenda or asset in it, or `'new'`; upgrade → any server or `'new'`; ICE → any server or `'new'`. Unknown server or a missing `server` → `bad_target`. Runner naming a `server` → `bad_target`.
- Costs: Corp ICE = number of ICE already on that server (`'new'` = 0); other Corp installs 0. Runner installs = card `cost`. `play` = card `cost`. Programs need `memory.used + card.memory ≤ MEMORY_LIMIT`. Every install/play costs 1 click.
- `play`: the card leaves the hand and goes face up on top of its owner's discard pile, then its `onPlay` effects resolve in order. `draw` effects stop at an empty deck (no loss: only the Corp's mandatory draw loses).

### Event sequences
- `install` → [`credits_spent`] → [`server_created`] (when `'new'`) → `card_installed`.
- `play` → [`credits_spent`] → `card_played` → the effects' `credit_gained {amount}` / one `card_drawn` per card drawn.

### `handOptions`
For each of the viewer's hand cards: every offered target for that card's type, in order (Corp installs: servers in `corpServers` order, then `'new'`; play: one option). `bad_card`/`bad_target` targets are never listed; any other reason is reported in `reject` (so the UI can show a lit target with its price and hint). `reject` equals what `apply` would answer; `cost` is the credits the action would cost.

### `legalActions` order
`draw, gain_credit, end_turn, discard, install… (by hand index, then target order), play… (by hand index)`.

## `@overclock/match` (host; `packages/match`)
Owns one game's `GameState` and talks to seats only through projections. It is the same contract a network server will expose later.

```ts
interface SeatUpdate { view: PlayerView; events: GameEvent[] }   // events already viewEvents()-projected
type MatchUpdate = Record<Side, SeatUpdate>;

class LocalMatch {
  constructor(seed: number);
  readonly seed: number;
  view(seat: Side): PlayerView;
  /** seat must equal action.player, otherwise invalid_action (state unchanged).
   *  Rejections go to the submitting seat only; the other seat gets events: []. */
  submit(seat: Side, action: Action): MatchUpdate;
  actions(): readonly Action[];   // every submitted action that reached the engine (not seat
                                  // mismatches), as JSON copies, for replay(seed, actions)
}
```
Seats receive Sprint 2 events already projected (`card_installed` without `cardId`/`handIndex` for the Runner seat on Corp installs).

**Test-only:** `@overclock/match/testing` exports `planBusyBoard(seed, goal?) -> { seed, actions, activePlayer }` (drives a `LocalMatch` through seat views until 3 remotes have 2 ICE each and the Runner has 4 installs; `actions` replay to that board for the same seed) and `busyBoardReached(view)`. For Node-side e2e setup only; the client must not import it.

The client and AI may import only the public index of engine/cards/match. The client may not import `apply`, `newGame`, `legalActions`, `viewFor` or `replay` (it goes through the match).

## Rules for contributors
- Every new action/event is added here, to the validation table and to the sprint tech plan.
- Every action has Vitest tests for its success path and each rejection reason.
- Card behavior belongs in `@overclock/cards` data + the effect DSL, not in engine special cases.
