# @overclock/engine

The rules engine. Pure and deterministic: `(state, action) -> { state, events }`. No DOM, no timers, no `Math.random`; all randomness comes from a seeded RNG stored in the state. Implements `docs/RULES_SPEC.md`.

Keep this public API small. Anything not exported from `src/index.ts` is internal. State, actions and events are plain JSON so a game server can store, send and replay them.

## Public API

### `newGame(seed: number): GameState`
Creates a new game. Same seed always gives the same shuffled decks and opening hands. The game starts on turn 1, the Corp's turn: Corp has 3 clicks and has already taken its mandatory start-of-turn draw (6 cards in hand). The Runner has 0 clicks.

### `apply(state: GameState, action: Action): { state: GameState; events: GameEvent[] }`
Applies one action. Never mutates the input and never throws for illegal or malformed actions: it returns the unchanged state plus an `action_rejected` event.

### `legalActions(state: GameState, player: Side): Action[]`
Actions `player` may take right now, in a fixed order: draw, gain_credit, end_turn, discard, install… (by hand index, then target), play… (by hand index). `discard` is listed once as a representative (the last N hand cards); `PlayerView.pendingDiscard` says that any N distinct hand indices are legal. For per-card prices and refusal reasons use `PlayerView.handOptions`.

### `viewFor(player: Side, state: GameState): PlayerView`
What `player` is allowed to see. Opponent hand contents, all deck orders, the Corp's face-down discards and every unrezzed installed Corp card (to the Runner) are hidden. The AI and the client render only from this. Includes `legalActions` and `handOptions` for the viewer.

### `viewEvents(player: Side, events: GameEvent[]): GameEvent[]`
Projects events for `player`. For the opponent: `card_drawn` loses `cardId`; `cards_discarded` loses `handIndices`, and also `cardIds` when the Corp discarded (face down); `card_installed` loses `handIndex`, and also `cardId` for Corp installs; `card_played` loses `handIndex`. Run engine events through this before showing them to a player.

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

`GameState` is plain JSON: `seed`, `rng` (mulberry32 state), `turn`, `activePlayer`, `phase`, `result`, and `players.{corp,runner}` with `deck` (top = index 0), `hand`, `discard`, `credits`, `clicks`. Card entries are card definition ids from `@overclock/cards` (`getCard(id)`); duplicates are extra copies. *(Sprint 2 adds `servers`, `rig`, `nextUid`, `nextRemote`, and discard entries become `{cardId, faceUp}`: see below.)*

## Sprint 2 interface (pinned: implement exactly this; changes go through the architect)

Adds installing and playing cards. Everything from Sprint 1 still holds except the discard pile shape (marked **changed**).

```ts
const MEMORY_LIMIT = 4;                       // Runner program memory (fixed this sprint)

type CentralServerId = 'hq' | 'rd' | 'archives';
type RemoteServerId = `remote${number}`;      // remote1, remote2, ... never reused
type ServerId = CentralServerId | RemoteServerId;

// ---- state additions ----
interface Installed { uid: string; cardId: string; rezzed: boolean }   // uid "i1", "i2", ...; rezzed always false this sprint
interface Server { id: ServerId; ice: Installed[]; content: Installed[] } // ice[0] innermost, new ICE pushed = outermost
interface DiscardEntry { cardId: string; faceUp: boolean }
// GameState gains: servers: Server[] (hq, rd, archives, remote1...), rig: Installed[] (install order),
//                  nextUid: number, nextRemote: number
// PlayerState.discard: DiscardEntry[]        // changed (was string[])

// ---- actions ----
type Action = /* Sprint 1 actions */
  | { type: 'install'; player: Side; handIndex: number; server?: ServerId | 'new' } // 1 click
  | { type: 'play'; player: Side; handIndex: number };                            // 1 click

type RejectReason = /* Sprint 1 reasons */
  | 'bad_card' | 'bad_target' | 'not_implemented' | 'no_credits' | 'no_memory';

// ---- events ----
type GameEvent = /* Sprint 1 events */
  | { type: 'credits_spent'; player: Side; amount: number }        // only when amount > 0
  | { type: 'server_created'; server: ServerId }
  | { type: 'card_installed'; player: Side; uid: string; zone: 'ice' | 'content' | 'rig';
      server?: ServerId;      // Corp installs
      handIndex?: number;     // owner only
      cardId?: string }       // owner only for Corp installs (face down); both for Runner installs
  | { type: 'card_played'; player: Side; cardId: string; handIndex?: number }; // handIndex owner only

// ---- view ----
interface InstalledView { uid: string; cardId: string | null; faceUp: boolean } // Runner sees cardId null for every unrezzed Corp card
interface ServerView { id: ServerId; ice: InstalledView[]; content: InstalledView[] }
interface CardOption { action: Action; cost: number; reject: RejectReason | null }
interface PlayerSideView { /* Sprint 1 fields */ discard: (string | null)[] } // changed: null = face down to the viewer
interface PlayerView {
  /* Sprint 1 fields */
  corpServers: ServerView[];
  rig: InstalledView[];
  memory: { used: number; limit: number };
  handOptions: CardOption[][];   // per viewer hand index
}
```

### Card DSL v0 (`@overclock/cards`)
```ts
type Effect = { op: 'gain_credits'; amount: number } | { op: 'draw'; count: number };
interface CardDef { /* ... */ onPlay?: Effect[]; needs?: 'runs' }
```
Effects run in order. `draw` stops when the deck is empty (no loss; only the Corp's mandatory draw loses). A card with `needs: 'runs'` is refused with `not_implemented`. There is no per-card code in the engine.

### Install and play rules
- **Corp** (`server` required): agenda / asset → a remote server with no agenda or asset in it, or `'new'`. Upgrade → any server (HQ, R&D, Archives, any remote) or `'new'`. ICE → any server or `'new'`; costs 1 credit per ICE already protecting that server (0 for a new server). Corp non-ICE installs cost 0 (they are installed unrezzed, face down).
- **Runner** (`server` must be absent): program / hardware / resource → the rig; costs the card's `cost`. Programs need `memory used + card memory ≤ MEMORY_LIMIT`.
- **Play**: operation (Corp) / event (Runner); pays the card's `cost`, the card goes face up on top of its owner's discard pile (Archives for the Corp), then its `onPlay` effects resolve.
- Every install and play costs 1 click. `'new'` creates `remote<nextRemote>` (appended to `servers`).
- Hand-limit discards: Runner's face up, Corp's face down (unchanged; now stored as `{cardId, faceUp}`).

### Validation order (rules.ts)
`invalid_action` (shape: `handIndex` an integer; `server`, if present, a string) → `game_over` → `not_your_turn` → `wrong_phase` (action step) → `no_clicks` → `bad_card` (index out of range; install of an operation/event; play of anything else) → `bad_target` (Corp: missing/unknown server or one the card may not go in; Runner: any `server` given) → `not_implemented` (`needs: 'runs'`) → `no_credits` → `no_memory`.

### Event sequences
- `install` → [`credits_spent`] → [`server_created`] → `card_installed`.
- `play` → [`credits_spent`] → `card_played` → the effects' own events (`credit_gained`, `card_drawn` × n).
- Opponent projection (`viewEvents`): `card_installed` loses `handIndex` (and `cardId` for Corp installs); `card_played` loses `handIndex`. `credits_spent` and `server_created` are public.

### `handOptions` and `legalActions`
- `handOptions[i]` lists, for the viewer's hand card `i`, every *offered* action with its engine-computed credit `cost` and `reject` (the reason it would be refused now, or null). Offered = the card type fits the action and the target is allowed for that card (so `bad_card`/`bad_target` never appear). Any other reason may appear, e.g. `no_credits`, `no_memory`, `not_implemented`, `no_clicks`, `not_your_turn`. Targets are listed in server order (hq, rd, archives, remotes) then `'new'`. **The client never computes a price, a target or memory.**
- `legalActions` order: draw, gain_credit, end_turn, discard, install… (by hand index, then target in the order above), play… (by hand index).

### Not in Sprint 2
No rez, runs, advancing, scoring, trashing, or installed-card abilities. No `hasMeaningfulResponse` yet: there is still no response window.

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
### Setup planner (tests/demos): `planBusyBoard(seed, goal?)`
```ts
interface BusyBoardGoal { remotes: number; icePerRemote: number; runnerInstalls: number } // default 3, 2, 4
interface BusyBoardPlan { actions: Action[]; activePlayer: Side; turn: number }
function planBusyBoard(seed: number, goal?: Partial<BusyBoardGoal>): BusyBoardPlan;
```
Drives a `LocalMatch(seed)` with ordinary legal actions (choosing from `handOptions`/`legalActions`) until the Corp has 3 remote servers with 2 ICE each (plus an agenda/asset inside when it had one to open the server with) and the Runner has 4 installed cards, and returns the action list. Deterministic per seed; every action is accepted; stops as soon as the board is reached (either seat may be active; see `activePlayer`). Throws if the board can't be reached (tested for seeds 1..300 in CI and 1..30000 once by hand). For Playwright: `import { planBusyBoard } from '@overclock/match'` in a spec (Node), open the page with the same `?seed=`, then send each action through the test hook's `dispatch` in order.

The client and AI may import only the public index of engine/cards/match. The client may not import `apply`, `newGame`, `legalActions`, `viewFor` or `replay` (it goes through the match).

## Rules for contributors
- Every new action/event is added here, to the validation table and to the sprint tech plan.
- Every action has Vitest tests for its success path and each rejection reason.
- Card behavior belongs in `@overclock/cards` data + the effect DSL, not in engine special cases.
