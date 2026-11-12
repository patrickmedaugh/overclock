# @overclock/engine

The rules engine. Pure and deterministic: `(state, action) -> { state, events }`. No DOM, no timers, no `Math.random`; all randomness comes from a seeded RNG stored in the state. Implements `docs/RULES_SPEC.md`.

Keep this public API small. Anything not exported from `src/index.ts` is internal. State, actions and events are plain JSON so a game server can store, send and replay them.

## Public API

### `newGame(seed: number): GameState`
Creates a new game. Same seed always gives the same shuffled decks and opening hands. The game starts on turn 1, the Corp's turn: Corp has 3 clicks and has already taken its mandatory start-of-turn draw (6 cards in hand). The Runner has 0 clicks.

### `apply(state: GameState, action: Action): { state: GameState; events: GameEvent[] }`
Applies one action. Never mutates the input and never throws for illegal or malformed actions: it returns the unchanged state plus an `action_rejected` event.

### `legalActions(state: GameState, player: Side): Action[]`
Actions `player` may take right now, in order: draw, gain_credit, end_turn, discard, then every legal install/play option (hand order, places in `handOptions` order). The discard step lists one representative `discard` (the last N hand cards), and `PlayerView.pendingDiscard` says that any N distinct hand indices are legal.

### `viewFor(player: Side, state: GameState): PlayerView`
What `player` is allowed to see. Opponent hand contents, all deck orders, the Corp's face-down discards and the Corp's installed (face-down) cards are hidden from the Runner (counts / `null` only). The AI and the client render only from this. Includes `legalActions` and `handOptions` for the viewer.

### `viewEvents(player: Side, events: GameEvent[]): GameEvent[]`
Projects events for `player`. For the opponent: `card_drawn` loses `cardId`; `cards_discarded` loses `handIndices`, and also `cardIds` when the Corp discarded (face down); `card_installed` and `card_played` lose `handIndex`; and the Runner's copy of a Corp `card_installed` loses `cardId`. `card_played`/`card_resolved` are otherwise public. Run engine events through this before showing them to a player.

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
  discard: string[] | null;  // Sprint 2: now (string | null)[], see below
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

## Sprint 2 additions (pinned: implement exactly this; changes go through the architect)

```ts
type ServerId = 'hq' | 'rd' | 'archives' | `remote-${number}`;  // remote numbers never reused
type InstallTarget = ServerId | 'new';

type Action = /* Sprint 1 actions */
  | { type: 'install'; player: Side; handIndex: number; server?: InstallTarget } // 1 click
  | { type: 'play'; player: Side; handIndex: number };                           // 1 click

type RejectReason = /* Sprint 1 reasons */
  | 'bad_card' | 'bad_target' | 'slot_taken' | 'no_memory' | 'no_credits' | 'needs_runs';

type InstallSlot = 'ice' | 'root' | 'program' | 'hardware' | 'resource';
type GameEvent = /* Sprint 1 events */
  | { type: 'server_created'; serverId: ServerId; remote: number }
  | { type: 'credits_spent'; player: Side; amount: number }        // only if > 0, before the install/play
  | { type: 'card_installed'; player: Side; uid: string;
      handIndex?: number;   // owner only
      cardId?: string;      // hidden from the Runner for Corp installs
      server?: ServerId;    // Corp only
      slot: InstallSlot; index: number }  // index in the slot list (ICE: new card is outermost = last)
  | { type: 'card_played'; player: Side; handIndex?: number /* owner only */; cardId: string; cost: number }
  | { type: 'card_resolved'; player: Side; cardId: string };      // now face up on the discard pile

interface InstalledView { uid: string; cardId: string | null /* null = face down to viewer */; faceUp: boolean }
interface ServerView { id: ServerId; remote: number | null; ice: InstalledView[] /* [0] innermost */; root: InstalledView[] }
interface RigView { program: InstalledView[]; hardware: InstalledView[]; resource: InstalledView[];
                    memory: { used: number; limit: number } }
interface PlaceOption { place: InstallTarget | 'rig' | 'play'; cost: number; action: Action;
                        reason: RejectReason | null }   // null = legal now
interface HandOption { handIndex: number; places: PlaceOption[] }

interface PlayerSideView { /* Sprint 1 fields */ discard: (string | null)[] } // null = face down to viewer
interface PlayerView { /* Sprint 1 fields */
  servers: ServerView[];       // hq, rd, archives, then remotes in creation order
  rig: RigView;                // face up to both
  handOptions: HandOption[];   // active viewer in the action phase only (else []); one per hand card
}
```

- **State:** `GameState.nextUid`, `nextRemote` (start at 1). `players.corp.servers: ServerState[]` with `ServerState {id, ice: Installed[], root: Installed[]}` (`ice[0]` innermost, last outermost). `players.runner.rig {program, hardware, resource: Installed[]}`. `Installed {uid: "i<n>", cardId, rezzed: false}`; the uid is given at install time, never at the deal. `PlayerState.discard: {cardId, faceUp}[]` (Corp hand-limit discards face down; played operations/events and Runner discards face up). `BASE_MEMORY = 4`.
- **Install, Corp:** `server` required. Agenda/asset/upgrade cost 0 credits; ICE costs the target server's ICE count ('new' = 0). 'new' creates `remote-<nextRemote>` first. Remote root: at most one agenda/asset plus any upgrades. Central root: upgrades only. ICE is added outermost.
- **Install, Runner:** no `server`. Pays `card.cost`; programs need `card.memory` free (limit `BASE_MEMORY`).
- **Play:** operation/event only. Pays `card.cost`, runs `card.onPlay` (effect DSL, `effects.ts`), then the card goes face up on the discard pile. Cards with `needs: 'runs'` are refused (`needs_runs`).
- **handOptions:** computed with the same validation table. Places that are structurally impossible (`bad_target`, `slot_taken`) are left out; places blocked by `no_clicks`/`no_credits`/`no_memory`/`needs_runs` are listed with that reason. Corp places: every server in order, then 'new'. Runner: 'rig'. Operations/events: 'play'.

### Event sequences
- `draw` → `card_drawn`. `gain_credit` → `credit_gained`.
- `end_turn`, hand ≤ 5 → `turn_ended`, `turn_started`, then for a Corp turn `card_drawn` (or `game_over` if its deck is empty).
- `end_turn`, hand > 5 → `discard_required{count}` (clicks set to 0, `phase='discard'`). Then `discard` → `cards_discarded`, `turn_ended`, `turn_started`, ... as above.
- `install` → (`server_created` if 'new') → (`credits_spent` if > 0) → `card_installed`.
- `play` → (`credits_spent` if > 0) → `card_played` → effect events (`credit_gained`, `card_drawn` ×n) → `card_resolved`.

### Validation (`src/rules.ts`, one table used by `apply` and `legalActions`)
Checks run in this order; the first failure is the reason: `invalid_action` (shape: known type, valid `player`, `handIndices` an array of integers, `handIndex` an integer, `server` a string if present) → `game_over` (phase is `over`) → `not_your_turn` → `wrong_phase` (draw/gain_credit/end_turn/install/play need `action`, discard needs `discard`) → `no_clicks` (draw, gain_credit, install, play) → then:
- draw: `deck_empty`. discard: `bad_discard` (not exactly hand−5 indices, duplicates, or out of range).
- install: `bad_card` (index out of range / not installable) → `bad_target` (Runner gave a server; Corp: none/unknown; agenda/asset to a central) → `slot_taken` → `no_memory` → `no_credits`.
- play: `bad_card` (not an operation/event) → `needs_runs` → `no_credits`.

`GameState` is plain JSON: `seed`, `rng` (mulberry32 state), `turn`, `activePlayer`, `phase`, `result`, `nextUid`, `nextRemote`, and `players.{corp,runner}` with `deck` (top = index 0), `hand`, `discard` (`{cardId, faceUp}` entries), `credits`, `clicks`, plus `corp.servers` and `runner.rig`. Card entries are card definition ids from `@overclock/cards` (`getCard(id)`); duplicates are extra copies.

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
The client and AI may import only the public index of engine/cards/match. The client may not import `apply`, `newGame`, `legalActions`, `viewFor` or `replay` (it goes through the match).

## Rules for contributors
- Every new action/event is added here, to the validation table and to the sprint tech plan.
- Every action has Vitest tests for its success path and each rejection reason.
- Card behavior belongs in `@overclock/cards` data + the effect DSL, not in engine special cases.
