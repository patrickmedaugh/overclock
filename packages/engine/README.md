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
type ServerId = 'hq' | 'rd' | 'archives' | `remote${number}`;

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

## Sprint 3 interface (pinned: implement exactly this; changes go through the architect)

Everything in the Sprint 1 and 2 interfaces still holds. Rules: `docs/RULES_SPEC.md` § Runs, Advancing and scoring, Damage, Winning. Tech plan: `docs/sprints/sprint-03-tech-plan.md`.

```ts
const WINNING_POINTS = 7;
type Phase = 'action' | 'discard' | 'run' | 'over';          // every Sprint 1/2 action is wrong_phase during a run
type WinReason = 'corp_decked' | 'agenda_points' | 'flatline';
type RunStep = 'approach' | 'encounter' | 'continue' | 'access';
type AccessFrom = 'hq' | 'rd' | 'archives' | 'remote';
type RunOutcome = 'accessed' | 'jacked_out' | 'ended_by_ice' | 'flatline';

// ---- state additions (plain JSON) ----
// Installed.advancements: number                 0 by default (Runner cards too)
// PlayerState.scoreArea: string[]                card ids, face up, in order
// GameState.run: RunState | null                 internal shape (state.ts); clients read PlayerView.run
// GameState.lastRunTurn: number | null           turn a run was last *started* (Neural EMP)

// ---- actions ----
type Action = /* Sprint 1/2 actions */
  | { type: 'play'; player; handIndex; server?: ServerId }   // server: only for run events with no fixed server (Inside Job)
  | { type: 'run'; player; server: ServerId }                // Runner, 1 click
  | { type: 'rez'; player; uid: string }                     // Corp, approach step, uid = approached ICE; pays card cost
  | { type: 'pass'; player }                                 // the default at the current step (see below)
  | { type: 'jack_out'; player }                             // Runner, continue step only
  | { type: 'use_ability'; player; uid: string; ability: number; sub?: number } // breaker uid, index into card abilities; sub required for breaks
  | { type: 'steal'; player; card: number }                  // index into run.access.cards
  | { type: 'trash'; player; card: number }                  // index into run.access.cards; pays trash cost
  | { type: 'advance'; player; uid: string }                 // Corp, 1 click + 1 credit, own installed agenda
  | { type: 'score'; player; uid: string };                  // Corp, no click, own turn, action phase, counters >= requirement

type RejectReason = /* Sprint 1/2 reasons */ | 'too_weak' | 'condition_not_met';
```

### Run steps and `pass`
Who decides (`run.waitingOn`): the Corp at `approach`, the Runner at every other step. The other side gets `not_your_turn` for any action.

| step | decider | `pass` means | other actions |
|---|---|---|---|
| `approach` | Corp | Don't rez (ICE passed face down) | `rez` |
| `encounter` | Runner | Let it through (unbroken subroutines fire in order) | `use_ability` |
| `continue` | Runner | Continue (next ICE inward, or into the server) | `jack_out` |
| `access` | Runner | Leave it / Done (refused `bad_target` while an unstolen agenda is shown) | `steal`, `trash` |

Position walks `ice.length-1 … 0` (outermost first), then the server (`position = -1`). The engine auto-passes (the client never does):
- **approach** is skipped when the ICE is already rezzed (→ encounter) or the Corp cannot pay its rez cost (→ passed face down);
- an **encounter** ends by itself when every subroutine is broken, or when Inside Job's bypass applies (`ice_bypassed`);
- no `continue` stop before the first ICE; a server with no ICE is entered directly;
- an access group ends by itself once every card in it is stolen or trashed; the run ends when nothing is left to access.
"Let it through" with no usable breaker still stops (the player sees what fires), and so does Done on a card that can't be taken.

### Access
- HQ: 1 card picked with the seeded RNG. R&D: the top card, then (The Maker's Eye) the next ones, one at a time; a short deck stops early. A remote: every card in it, one at a time (install order). Archives: every card as **one** group (`access.cards` has them all), all turned face up for good; agendas stealable, nothing trashable.
- Upgrades installed in a central server's root are accessed after the central's own cards, one at a time.
- Agendas: only `steal` (mandatory). Cards with a trash cost (not from Archives): `trash` (price; may be `no_credits`) or `pass` (Leave it). Other cards: `pass` (Done).
- An empty HQ/R&D/Archives/remote: the run is successful and ends (`run_ended{accessed}`).

### Rejection order
- Run decisions (`rez`, `pass`, `jack_out`, `use_ability`, `steal`, `trash`): `invalid_action` (shape) → `game_over` → `not_your_turn` (not the deciding side; outside a run, not the active player) → `wrong_phase` (no run, or a step the action does not belong to) → `bad_target` (bad uid / ability / sub / card, sub already broken, breaker type ≠ ICE type, `rez` uid ≠ approached ICE, `trash` on an agenda / a card without trash cost / from Archives, `steal` on a non-agenda or a stolen card, `pass` at access with an unstolen agenda) → `too_weak` (break only) → `no_credits`.
- `run`: `invalid_action` → `game_over` → `not_your_turn` → `wrong_phase` → `no_clicks` → `bad_target` (unknown server, or the Corp) .
- `advance`: `invalid_action` → `game_over` → `not_your_turn` → `wrong_phase` → `no_clicks` → `bad_target` (not one of the player's installed agendas; the Runner always) → `no_credits`.
- `score`: `invalid_action` → `game_over` → `not_your_turn` → `wrong_phase` → `bad_target` (not an installed agenda of the player, or fewer counters than its requirement — never offered then).
- `play`: `… no_clicks → bad_card → bad_target (server given to a card that takes none, or missing/unknown for Inside Job) → not_implemented → condition_not_met (playIf) → no_credits`.

### Events (all public unless noted)
`run_started{server, cardId?}` (cardId = the run event), `ice_approached{uid, position}`, `ice_rezzed{uid, cardId}`, `ice_encountered{uid}`, `ice_bypassed{uid}`, `strength_changed{uid, strength}` (breaker pump, and each boost dropping back at the end of the encounter/run), `subroutine_broken{iceUid, sub, breakerUid}`, `subroutine_fired{iceUid, sub}`, `clicks_lost{player, amount}` (only when > 0), `net_damage{amount, cardIds}` (discarded face up to the Heap), `ice_passed{uid}`, `run_successful{server}`, `card_accessed{cardId?, from, uid?}` (**the Corp's projection drops `cardId` when `from` is `rd`**), `agenda_stolen{cardId, points}`, `card_trashed{cardId, from, uid?}`, `run_ended{server, outcome}`, `card_advanced{uid, advancements}`, `agenda_scored{uid, cardId, points}`; `credits_spent` for rez / break / pump / trash / advance; `game_over` with the new reasons (after `run_ended` when a run ends the game).

Sequences: `run` → `run_started` → (`ice_approached` → [`ice_rezzed`] → `ice_encountered` …) or (`run_successful` → `card_accessed`…). `pass` at encounter → per unbroken sub `subroutine_fired` + its effect (`clicks_lost` / `net_damage` / `run_ended{ended_by_ice}`). Passing ICE → [`strength_changed`…] `ice_passed`. `jack_out` → `run_ended{jacked_out}`. Steal to 7 → `agenda_stolen`, `run_ended{accessed}`, `game_over{runner, agenda_points}`. Flatline → `net_damage`, [`run_ended{flatline}`], `game_over{corp, flatline}`.

### View additions
```ts
interface InstalledView { /* ... */ advancements: number }       // both sides see the number (backs too)
interface PlayerSideView { /* ... */ scored: string[]; points: number }
interface PlayerView {
  /* ... */
  runOptions: CardOption[];                         // Runner: one `run` per server (corpServers order); Corp: []
  installedOptions: Record<string, CardOption[]>;  // Corp: per installed agenda uid, `advance` (cost 1), then `score` once it has enough counters; Runner: {}
  run: RunView | null;
}
interface RunView {
  server: ServerId;
  position: number;               // index into the server's ice; -1 at the server
  step: RunStep;
  waitingOn: Side;
  iceUid: string | null;          // ICE approached / encountered / just passed
  ice: { cardId: string | null; strength: number | null; subroutines: { text: string; broken: boolean }[] } | null;
                                  // the Runner sees cardId/strength/subroutines only once the ICE is rezzed (null / null / [])
  breakerStrength: Record<string, number>;   // every installed icebreaker's current strength, boosts included
  access: { cards: { cardId: string | null; from: AccessFrom; stolen: boolean; uid: string | null }[] } | null;
                                  // cardId null only in the Corp's view of R&D cards; uid = installed card, else null
  extraAccess: number;
  bypassPending: boolean;         // Inside Job's bypass not used yet
  options: CardOption[];          // the viewer's offered moves at this step (empty when not the viewer's decision)
}
```
`run.options` order: approach `rez`, `pass` · encounter: per matching breaker (rig order) its abilities in printed order (a break ability once per unbroken subroutine, `sub` ascending), then `pass` · continue `pass`, `jack_out` · access: per card `steal` / `trash`, then `pass` (only when no unstolen agenda is shown). Same rules as `handOptions`: `bad_target` moves are never listed (so a wrong-type breaker shows nothing), any other reason is in `reject` (`too_weak`, `no_credits`), and `cost` is the credits the move would cost (break/pump price, rez cost, trash cost). **The client never computes a price, a strength or what fires.**

`legalActions` order: `draw, gain_credit, end_turn, discard, install…, play…, run…, advance/score…` (by `installedOptions`), and during a run the decider's legal `run.options`.

Extra exports: `waitingOn(state): Side | null` (who the game waits on: the run's decider, else the active player; null when over) and `hasMeaningfulResponse(state, player): boolean` (`legalActions(state, player).length > 0`). The engine already auto-passes empty windows; these are for hosts/AI.

### Card DSL v1 (`@overclock/cards`)
`Effect += {op:'net_damage', amount} | {op:'lose_clicks', amount} | {op:'end_run'} | {op:'run', server?, extraAccess?, bypassFirst?}` (damage/click loss always hit the Runner; `run` is a card's last effect). ICE: `subroutines: {text, effect}[]`. Breakers: `abilities: ({op:'break', cost, iceType, count: 1} | {op:'strength', cost, amount, until: 'encounter' | 'run'})[]`. Operations: `playIf?: 'runner_ran_last_turn'` (`lastRunTurn === turn − 1`). `ServerId`/`CentralServerId` now live in `@overclock/cards` (re-exported by the engine). No card has `needs` any more.

## Sprint 4 interface (pinned: implement exactly this; changes go through the architect)

Everything in the Sprint 1–3 interfaces still holds. Rules: `docs/RULES_SPEC.md` § Advancing and scoring ("When scored" bonuses), Bad publicity. Tech plan: `docs/sprints/sprint-04-tech-plan.md`.

```ts
type Phase = 'action' | 'discard' | 'run' | 'choice' | 'over';   // 'choice': a "when scored" choice waits on a player
type ChoiceKind = 'free_rez';

// ---- card DSL (@overclock/cards) ----
// CardDef.onScore?: Effect[]        agendas: resolved only by `score` (never on steal), in order
// Effect += { op: 'bad_publicity'; amount }   the Corp takes `amount` bad publicity
//         | { op: 'free_rez'; what: 'ice' }   opens the free-rez choice; must be the last effect
// Hostile Takeover  onScore: [gain_credits 7, bad_publicity 1]
// Priority Requisition onScore: [free_rez ice]

// ---- state additions (plain JSON) ----
// GameState.badPublicity: number                                   the Corp's, 0 at start
// GameState.choice: { kind: 'free_rez'; player: 'corp'; cardId } | null   cardId = the scored agenda
// RunState.tempCredits: number                                     run-only credits (bad publicity)

// ---- events (all public) ----
type GameEvent = /* Sprint 1–3 events */
  | { type: 'credits_spent'; player; amount; temp?: number }   // temp (only when > 0) = part paid from run-only credits
  | { type: 'bad_publicity_gained'; amount: number; total: number }
  | { type: 'choice_opened'; kind: ChoiceKind; player: Side; cardId: string }
  | { type: 'choice_closed'; kind: ChoiceKind; skipped: boolean }
  | { type: 'temp_credits_gained'; amount: number }   // right after run_started, only if > 0
  | { type: 'temp_credits_lost'; amount: number };    // right before run_ended, only if > 0

// ---- view additions ----
interface RunView { /* ... */ tempCredits: number }   // both players; 0 when none
interface ChoiceView {
  kind: ChoiceKind;
  waitingOn: Side;            // 'corp'
  cardId: string;             // the scored agenda (public)
  options: CardOption[];      // deciding viewer: one `rez` (cost 0) per unrezzed installed ICE, then `pass` (= Skip); other viewer: []
}
interface PlayerView { /* ... */ badPublicity: number; choice: ChoiceView | null }
```
No new action types.

### Scoring with a bonus
`score` → `agenda_scored` → the card's `onScore` effects in order. If the score brings the Corp to 7 points: `agenda_scored`, `game_over{corp, agenda_points}` and **no** bonus. A stolen agenda never resolves `onScore`.
- Hostile Takeover: `agenda_scored`, `credit_gained{corp, 7}`, `bad_publicity_gained{amount: 1, total}`.
- Priority Requisition with ≥ 1 unrezzed installed ICE: `agenda_scored`, `choice_opened{free_rez, corp, cardId: PR}`; `phase = 'choice'`. With none: just `agenda_scored` (no window, no event).

### The choice phase (`free_rez`)
| action | who | effect |
|---|---|---|
| `rez {player:'corp', uid}` | Corp | rez any unrezzed installed Corp ICE (any server) for 0: `ice_rezzed{uid, cardId}`, `choice_closed{free_rez, skipped:false}` (no `credits_spent`) |
| `pass {player:'corp'}` | Corp | Skip: `choice_closed{free_rez, skipped:true}` |
Then `phase = 'action'`, `choice = null` (the Corp's turn continues). Rejections: the Runner → `not_your_turn` for any action; every Corp action other than `rez`/`pass` → `wrong_phase`; `rez` on a uid that is not an unrezzed installed ICE → `bad_target`. `waitingOn(state)` and `hasMeaningfulResponse` return / are true for the Corp only. `legalActions` (Corp) = the `choice.options` actions, in the same order (ICE: servers in `corpServers` order, then ICE index order, innermost first).

### Bad publicity in runs
At run start `run.tempCredits = badPublicity` (`temp_credits_gained` right after `run_started`, only if > 0). Runner payments during the run (break, pump, trash) use run-only credits first, then credits; `credits_spent.temp` says how much came from run-only credits. "Can afford" (`no_credits`, options' `reject`) counts credits + run-only credits. Left-overs vanish whenever the run ends (accessed, jacked out, ended by ICE, flatline, a steal that wins): `temp_credits_lost{amount}` right before `run_ended`. Run-only credits are never added to `players.runner.credits`. **The client never computes which ICE may be rezzed or how many credits a run has.**

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

**Test-only (Sprint 3):** `@overclock/match/testing` also exports `planToStep(seed, goal) -> { seed, goal, actions, waitingOn, activePlayer, info }`, `stepReached(goal, {corp, runner})` and `STEP_GOALS`. It plays a real game from `newGame(seed)` (both seats, through seat views) until `goal`:
- `corp_rez_prompt` — a run waits on the Corp's Rez / Don't rez (face-down ICE it can pay for). `info: {server, iceUid}`.
- `wall_of_static_encounter` — the Runner encounters a rezzed Wall of Static, Corroder installed, ≥ 2 credits. `info: {server, iceUid, breakerUid}`.
- `agenda_one_advance` — Corp's action step with a click and a credit, an installed agenda one advancement short. `info: {uid, cardId, server}`.
- `corp_one_score_from_win` — Corp's action step, an installed agenda ready to score that brings the Corp to 7. `info: {uid, cardId, server}`. **Not every seed works** (7 points needs Priority Requisition; if it lies deep in R&D the Corp runs out of cards first): seeds 1, 2, 3, 4, 5, 7, 12345 do (~80% of 1-100).
- `runner_one_steal_from_win` — Runner's action step with a click, a remote with no ICE holding an agenda that brings the Runner to 7. `info: {uid, cardId, server}`.
Dispatch `actions` in order, each as its own `action.player` (Corp actions happen during the Runner's turn: the rez decisions). Throws if the goal isn't reached.

The client and AI may import only the public index of engine/cards/match. The client may not import `apply`, `newGame`, `legalActions`, `viewFor` or `replay` (it goes through the match).

## Rules for contributors
- Every new action/event is added here, to the validation table and to the sprint tech plan.
- Every action has Vitest tests for its success path and each rejection reason.
- Card behavior belongs in `@overclock/cards` data + the effect DSL, not in engine special cases.
