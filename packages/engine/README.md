# @overclock/engine

The rules engine. Pure and deterministic: `(state, action) -> { state, events }`. No DOM, no timers, no `Math.random`; all randomness comes from a seeded RNG stored in the state. Implements `docs/RULES_SPEC.md`.

Keep this public API small. Anything not exported from `src/index.ts` is internal. State, actions and events are plain JSON so a game server can store, send and replay them.

## Public API

### `newGame(seed: number, options?): GameState`
Creates a new game. Same seed always gives the same shuffled decks and opening hands. The game starts on turn 1, the Corp's turn: Corp has 3 clicks and has already taken its mandatory start-of-turn draw (6 cards in hand). The Runner has 0 clicks.

### `apply(state: GameState, action: Action): { state: GameState; events: GameEvent[] }`
Applies one action. Never mutates the input and never throws for illegal or malformed actions: it returns the unchanged state plus an `action_rejected` event.

### `legalActions(state: GameState, player: Side): Action[]`
Actions `player` may take right now. Parameterized actions are listed once as a representative: during the discard step it contains one `discard` (the last N hand cards), and `PlayerView.pendingDiscard` says that any N distinct hand indices are legal.

### `viewFor(player: Side, state: GameState): PlayerView`
What `player` is allowed to see. Opponent hand contents, all deck orders, the Corp's face-down discards and unrezzed installed Corp cards (to the Runner) are hidden. The AI and the client render only from this. Includes `legalActions` for the viewer.

### `viewEvents(player: Side, events: GameEvent[]): GameEvent[]`
Projects events for `player`. For the opponent: `card_drawn` loses `cardId`, `cards_discarded` loses `handIndices`, and it also loses `cardIds` when the Corp discarded (face down); `card_installed`/`card_played` lose `handIndex`, and Corp `card_installed` also loses `cardId`. Run engine events through this before showing them to a player.

### `replay(seed: number, actions: Action[], options?): { state; events }`
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

## Sprint 5 interface (pinned: implement exactly this; changes go through the architect)

Everything in the Sprint 1–4 interfaces still holds. Rules: `docs/RULES_SPEC.md` § Runs step 4 (Last run). Tech plan: `docs/sprints/sprint-05-tech-plan.md`. No new actions.

```ts
// ---- events.ts ----
type SubOutcome = { sub: number; op: Effect['op']; amount: number };
//   amount = the actual size: clicks really lost ("if able", may be 0), net damage dealt (printed),
//   credits gained, cards drawn; 0 for end_run.
type GameEvent = /* Sprint 1–4 events */
  | { type: 'subroutine_resolved'; iceUid: string; cardId: string; outcome: SubOutcome };   // public

// ---- state additions (plain JSON) ----
// GameState.lastRun: { server: ServerId; cards: { cardId: string; from: AccessFrom }[] } | null
//   {server, cards: []} at run_started (replaces the previous one); a card appended at each
//   card_accessed (access order; stolen/trashed/left all kept); null when the Runner's turn ends.

// ---- view additions ----
interface RunView { /* ... */
  letFire: { iceCardId: string; outcomes: SubOutcome[]; ends: 'run' | 'game' | null } | null;
}
interface PlayerView { /* ... */
  lastRun: { server: ServerId; cards: { cardId: string; from: AccessFrom }[] } | null;
}
```

### `subroutine_resolved`
Pushed for every fired subroutine right after its own effect events and before anything the effect ends: `subroutine_fired`, (`clicks_lost` | `net_damage` | …), `subroutine_resolved`, then (`temp_credits_lost`, `run_ended`, `game_over`) if it ended the run / game. Examples:
- Enigma, Runner has clicks: `subroutine_fired{0}`, `clicks_lost{1}`, `subroutine_resolved{0, lose_clicks, 1}`, `subroutine_fired{1}`, `subroutine_resolved{1, end_run, 0}`, `run_ended{ended_by_ice}`.
- Enigma, no clicks: `subroutine_fired{0}`, `subroutine_resolved{0, lose_clicks, 0}`, …
- Neural Katana, flatline: `subroutine_fired{0}`, `net_damage{3}`, `subroutine_resolved{0, net_damage, 3}`, `run_ended{flatline}`, `game_over{corp, flatline}`.
`subroutine_fired` is unchanged.

### `RunView.letFire`
Non-null only in the **Runner's** view at step `encounter` with rezzed ICE while `pass` is offered (null for the Corp, at every other step and outside runs). `outcomes` = exactly the `subroutine_resolved` outcomes that `pass` would produce now, in order, stopping after the one that ends the run or the game; `ends` = `'run'` (ended by ICE), `'game'` (flatline), `null` (the run goes on; `outcomes: []` = every subroutine broken). Computed by running the real resolution on a throw-away copy of the state (same code path; the real state and RNG are untouched). Carries no hidden information (no discarded card ids). **The client never works out what ICE will do.**

### `PlayerView.lastRun`
Runner's view only, only when no run is in progress and `cards.length > 0`; otherwise null. Always null for the Corp. Stolen agendas (`players.runner.scored`) and face-up Archives (`discard` non-null entries) are already in the view.

## Sprint 6 interface (pinned: implement exactly this; changes go through the architect)

Everything in the Sprint 1–5 interfaces still holds. Tech plan: `docs/sprints/sprint-06-tech-plan.md`.

### Engine: game options
```ts
interface GameOptions { rezWindow: 'affordable' | 'always' }   // DEFAULT_OPTIONS = { rezWindow: 'affordable' }
newGame(seed: number, options?: Partial<GameOptions>): GameState  // GameState.options = the options, defaults filled in
replay(seed: number, actions: Action[], options?: Partial<GameOptions>)  // pass the game's own options
```
- `'affordable'` (default; hot-seat): unchanged. Approaching face-down ICE the Corp can't pay for passes it face down at once.
- `'always'` (online): approaching **any** face-down ICE waits on the Corp (`run.waitingOn = 'corp'`, step `approach`). The Corp's `run.options` = `rez` (with `reject: 'no_credits'` when unaffordable) then `pass`; `apply(rez)` is rejected `no_credits` then. So the Runner's view and events are the same whether or not the Corp can pay. Options never change the shuffle.

### Match host additions (`@overclock/match`)
```ts
class LocalMatch {
  constructor(seed: number, options?: Partial<GameOptions>);
  readonly options: GameOptions;
  static restore(seed: number, actions: readonly Action[], options?: Partial<GameOptions>): LocalMatch; // by replay
  static fromSnapshot(seed: number, state: GameState, actions: readonly Action[]): LocalMatch;        // server: same build only
  snapshot(): GameState;   // server persistence only; never sent to a seat
}
```

### Protocol v1 (`@overclock/protocol`, `packages/protocol/src/index.ts`)
Pure TS, engine types only. Every frame is JSON `{v: 1, t, …}`. Constants: `PROTOCOL_VERSION = 1`, `CREATE_PATH = '/v1/create'`, `gamePath(code) = '/v1/games/<CODE>'`, `HEALTH_PATH = '/health'` (→ `Health {ok: true, build, protocol: 1}`), `PING = '{"v":1,"t":"ping"}'` / `PONG = '{"v":1,"t":"pong"}'` (exact strings, auto-answered by the server runtime), `STORAGE_KEY = 'overclock.online.v1'` (`StoredSeat {server, code, seat, token}`).

Client → server (`ClientMsg`): `create {side, test?: {seed, actions}}` (on `/v1/create`; `test` only honoured when the server runs with `OVERCLOCK_TEST_MODE=1`) · `join` · `resume {token, since}` · `act {id, action}` · `ping`.

Server → client (`ServerMsg`): `seated {code, seat, token}` · `lobby {code, seat}` · `sync {seq, view, opponent}` · `update {seq, view, events, ack?}` · `rejected {ack, view, events}` · `presence {opponent}` · `error {code}` · `pong`. `Presence = 'none' | 'here' | 'away'`; `ErrorCode = 'no_game' | 'full' | 'bad_token' | 'version' | 'bad_message' | 'expired' | 'replaced'`.

`parseClientMsg(raw)` / `parseServerMsg(raw)` → `{ok: true, msg} | {ok: false, error: 'version' | 'bad_message'}`; never throw; shape checks only (an `action` is any object with a string `type` and a side `player`; the server's engine checks the rest). Size limits (UTF-8 bytes): client frames 8 KB (`MAX_CLIENT_MESSAGE_BYTES`), server frames 512 KB (`MAX_SERVER_MESSAGE_BYTES`; a busy-board view is ~3 KB but grows with the board). `encodeMsg(msg)` = `JSON.stringify`.

Game codes: `CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'`, `CODE_LENGTH = 4`, `normalizeCode(input)` (upper-case, drops spaces/dashes), `isGameCode(code)`, `makeCode(randomInt)` (the caller supplies a real random source).

Server behaviour (room): `seq` = accepted actions so far; each accepted action → `update` to both seats (`ack` = the submitter's `id`, submitter only); a rejection → `rejected` to the submitter only; a client seeing `seq ≠ last + 1` sends `resume {since}` and gets `sync`. `create` → `seated`, `lobby`. `join` → `seated` to the joiner, then `sync` to both seats. `resume` → `sync` (or `lobby` while nobody has joined); a second socket for a seat gets it and the first gets `error replaced` and is closed. `join` on a full game → `error full`; an unknown/expired code → `error no_game`; a wrong token → `error bad_token`. Online games use `rezWindow: 'always'`; when the Corp's only legal move at an approach is `pass`, the room sends that `pass` itself after a random 1.2–2.4 s (an ordinary `update`, no `ack`).

Sockets and errors (`apps/server`): every `error` except `bad_message` closes the socket (close code 4000, reason = the error code); `bad_message` (unparseable frame, a message the socket's role can't send, `act` before both seats are taken) keeps it open. A socket's first message on `/v1/games/<CODE>` must be `join` or `resume`; on `/v1/create`, `create`. `resume` also works on an already-seated socket (gap catch-up). A malformed code gets `error no_game` from the Worker. Sockets need an `Origin` from `ALLOWED_ORIGINS` (else HTTP 403, no socket). Idle cleanup counts from the last accepted move (or the join). Local server and test mode: `apps/server/README.md`.

**Test-only (Sprint 6):** `@overclock/match/testing` also exports `runnerViewLeaks(state, view?) -> string[]` and `runnerEventLeaks(runnerEvents, after) -> string[]` (empty = clean): the engine's hidden-information checks as pure functions (no Vitest), for the server leak test and Node-side e2e checks of what the Runner phone received.

## Sprint 7 interface (pinned: implement exactly this; changes go through the architect)

Everything in the Sprint 1–6 interfaces still holds unless noted. Tech plan: `docs/sprints/sprint-07-tech-plan.md`. No engine or client code checks a card id: every new behaviour is card data (DSL v2) resolved generically.

### Card DSL v2 (`@overclock/cards`, additive)
- Effects: `place_credits {amount}` (bank → the source card), `take_credits {amount: number | 'all'}` (source card → its owner, up to what it holds). The source card is `EffectContext.uid`.
- `CardDef` fields: `onInstall?: Effect[]` · `onTurnStart?: Effect[]` (Corp: only while rezzed) · `cardAbilities?: CardAbility[]` · `recurringCredits?: {amount, for: 'icebreaker'}` · `trashWhenEmpty?: true` · `memoryBonus?: number` · `iceRezDiscount?: number` (rezzed upgrade: ICE protecting its server, min 0) · `advanceable?: true` + `strengthPerAdvancement?: number` (ICE).
- `CardAbility = {label, when: 'click' | 'successful_run_remote', clicks, credits, requires?: 'hosted_credits', replacesAccess?: true, effects}`. `label` may contain `{gain}`: fill it from `CardOption.gain`.
- Data: Armitage Codebusting (`onInstall place 12`, `trashWhenEmpty`, click ability "Take {gain} credits": 1 click, `take_credits 2`, requires hosted credits) · Bank Job (`onInstall place 8`, `trashWhenEmpty`, `successful_run_remote` "Take {gain} credits from Bank Job": `take_credits 'all'`, `replacesAccess`) · Cyberfeeder (`recurringCredits {1, icebreaker}`) · Akamatsu Mem Chip (`memoryBonus 1`) · PAD Campaign (`onTurnStart gain_credits 1`) · Akitaro Watanabe (`iceRezDiscount 2`) · Ice Wall (`advanceable`, `strengthPerAdvancement 1`).

### State
- `Installed.hostedCredits: number` (0 by default; public).
- `RunStep` += `'success'`; `RunOutcome` += `'access_replaced'`.
- `RULES_VERSION = 1` (exported): bump when an old action log would replay differently — any rules change **or card-data behaviour change** (costs, strengths, effects). The online room stores it with each game and expires a stored game made under another version when a new build restores it (the replay-rejection check stays as a backstop). Leave it alone for client-only or text-only changes, so live games survive those deploys.

### Actions
- **New** `{type: 'activate', player, uid, ability}` — `ability` indexes `CardDef.cardAbilities` of the player's own installed, face-up card. Rejection order: `invalid_action` (shape) → `game_over` → `not_your_turn` (`waitingOn`) → `bad_target` (not own installed face-up card, or no such ability) → `wrong_phase` (`click`: action phase; `successful_run_remote`: run step `success`) → `no_clicks` → `condition_not_met` (`requires` unmet: no credits on the card) → `no_credits`. Breakers' `use_ability` is unchanged.
- **`rez`** is also legal in the Corp's **action phase** (no click) on an unrezzed asset/upgrade in any server; ICE there = `bad_target`. Order: `invalid_action` → `game_over` → `not_your_turn` (`waitingOn`) → `wrong_phase` (not action / approach / choice; or an asset/upgrade during a run or choice) → `bad_target` → `no_credits`.
- **`advance`** targets agendas **or** `advanceable` ICE (face up or down). `score` stays agendas only.

### Events (all public)
- `card_rezzed {uid, cardId, server}` — asset/upgrade rezzed in the action phase, after `credits_spent`. (ICE keeps `ice_rezzed`.)
- `ability_triggered {uid, cardId, trigger: 'click' | 'turn_start' | 'successful_run'}` — before the ability's own events. Only for face-up cards.
- `hosted_credits_changed {uid, credits}` — the card's new total (install, take, spend, refill).
- `rig_card_trashed {uid, cardId}` — a Runner card leaves the rig for the Heap (face up).
- `server_removed {server}` — an empty remote (no ICE, no cards) is removed.
- `credits_spent.hosted?` — the part of `amount` paid from credits on cards (only when > 0).

### Event sequences
- **Install with hosted credits** (Armitage / Bank Job / Cyberfeeder): `credits_spent` → `card_installed` → `hosted_credits_changed {credits: 12 | 8 | 1}`.
- **Click ability** (Armitage): `ability_triggered {trigger: 'click'}` → `hosted_credits_changed` → `credit_gained` → (`rig_card_trashed` when it emptied). Clicks/credits paid first (`credits_spent` only when the ability costs credits).
- **Rez an asset/upgrade** (action phase): `credits_spent` (when cost > 0) → `card_rezzed`.
- **Turn start**: `turn_started` → per rezzed Corp card with `onTurnStart` (servers order; ICE then content) / per Runner card (rig order): `ability_triggered {trigger: 'turn_start'}` → its effect's events (PAD: `credit_gained`); Runner recurring credits below their amount: `ability_triggered {trigger: 'turn_start'}` → `hosted_credits_changed` → then the Corp's mandatory `card_drawn`. Nothing extra when no such card is in play.
- **Breaker paid with recurring credits**: `credits_spent {amount, hosted?, temp?}` → `hosted_credits_changed` per paying card (rig order) → the ability's events. Payment order: eligible recurring credits (rig order), then run-only credits (bad publicity), then own credits. "Can afford" counts all three. Recurring credits never pay trash costs or installs.
- **Successful run on a remote with a usable `replacesAccess` ability** (Bank Job holding credits): `run_successful` → run step `success` (waiting on the Runner; no `card_accessed` yet). Options: one `activate` per usable card, then `pass` (= Access cards). `activate` → `ability_triggered {trigger: 'successful_run'}` → `hosted_credits_changed {credits: 0}` → `credit_gained` → `rig_card_trashed` → (`strength_changed` / `temp_credits_lost` as for any run end) → `run_ended {outcome: 'access_replaced'}`. `pass` → access as usual (`card_accessed` …). No usable ability, or a central server → no `success` step (nothing to decide).
- **Empty remote**: at the end of a run (after `run_ended`) and at the end of `score` (after its bonus events), every remote with no ICE and no cards is removed → `server_removed {server}`. Ids are never reused (`nextRemote` unchanged).

### Rules helpers
- `rezCost(state, ice)` = printed cost − every rezzed `iceRezDiscount` in that server's cards, min 0. Used by the approach option's `cost`, the `'affordable'` rez window and `no_credits`.
- `iceStrength(ice)` = printed + advancements × `strengthPerAdvancement`.
- `memoryLimit(state)` = 4 + rig `memoryBonus` (install `no_memory` and `PlayerView.memory.limit`).
- Recurring credits: placed on install, refilled to `amount` at the Runner's turn start (never above).

### View
- `InstalledView.hostedCredits: number` (public, both sides).
- `memory.limit` = `memoryLimit(state)`.
- `installedOptions` covers **both sides**, keyed by uid, listed off-turn with the reason in `reject`: Corp = agenda `advance` / `score`, advanceable ICE `advance`, unrezzed asset/upgrade `rez` (cost = rez cost); Runner = one `activate` per `click` ability. Never lists the other side's cards (the Runner gets no options or ids for unrezzed Corp cards).
- `CardOption` += `clicks?: number` (click cost of an `activate` option, only when > 0; other actions' click cost is implied by their type), `gain?: number` (credits the option gives: `activate` with `take_credits`), `hostedPay?: {uid, amount}[]` (breaker options, only when non-empty: which cards pay part of `cost`).
- `RunView.step` may be `'success'`: `options` = `activate` per usable card (`gain` = credits on it) + `pass`.
- `legalActions` includes every new option.

### Protocol (additive, still v1)
- Client `{v: 1, t: 'leave'}`: from a seat in a lobby nobody joined, the room closes (seat sockets closed with 1000 `left`, storage deleted; the code then answers `no_game`). In a started game, or from a socket without a seat: `bad_message` (kept open).
- Room restore by replay (snapshot from another build): if any logged action is rejected on replay, the game is expired (storage deleted; reattached sockets get `error expired`; `join`/`resume` get `expired` until the room is reused).

## Sprint 8 interface (pinned: implement exactly this; changes go through the architect)

Everything in the Sprint 1–7 interfaces still holds unless noted. Tech plan: `docs/sprints/sprint-08-tech-plan.md`. No engine or client code checks a card id. `RULES_VERSION = 2`.

### Card DSL v3 (`@overclock/cards`, additive)
- `CardType` += `'identity'` (never in a deck; one per side). Every card has `faction: 'haas_bioroid' | 'jinteki' | 'nbn' | 'weyland' | 'anarch' | 'criminal' | 'shaper' | 'neutral'` and `influence?` (pips, absent = 0). Identities: `minDeckSize`, `influenceLimit`, `link?` (shown only).
- `whenYouInstall?: {firstEachTurn: true, types?, effects}` (Haas-Bioroid: `gain_credits 1`) · `installDiscount?: {amount, firstEachTurn: true, types}` (Kate: 1, program/hardware, min cost 0) — both read from **active sources** = the side's identity + its face-up installed cards. A face-down Corp card is never an active source and never triggers (P1). Corp cards never have `onInstall`.
- `onRez?: Effect[]` (Corp cards, whenever they turn face up) · `trashPrevention?: {types}` (Sacrificial Construct) · `trashWhenEmpty` also on Corp cards (→ Archives face up).
- Effects += `gain_clicks {amount}` · `brain_damage {amount}` · `trash_installed {types: RunnerCardType[]}` (Corp chooses). `abilityGain` also sums `gain_credits` (labels "Gain {gain} credits"). `BreakerAbility.break.count: 1 | 2`.
- Decks: `DeckDef {identity, cards}`; `CORP_CORE_DECK` (c13 + 30), `RUNNER_CORE_DECK` (r13 + 30); `CORP_STARTER_DECK` / `RUNNER_STARTER_DECK` unchanged (frozen). `checkDeck(deck, {minDeckSize?}) → DeckProblem[]` (`unknown_card | not_identity | too_small | wrong_side | identity_in_deck | too_many_copies | agenda_faction | influence | agenda_points`), `deckInfluence`, `deckAgendaPoints`, `HOUSE_MIN_DECK_SIZE = 30`, `MAX_COPIES = 3`.
- New ids: c13 Haas-Bioroid: Engineering the Future, c14 Adonis Campaign, c15 Melange Mining Corp., c16 Biotic Labor, c17 Viktor 1.0, c18 Heimdall 1.0, c19 Rototurret; r13 Kate "Mac" McCaffrey: Digital Tinker, r14 Sure Gamble, r15 Magnum Opus, r16 Pipeline, r17 Battering Ram.

### Options and state
```ts
type DeckSet = 'core' | 'starter';
interface GameOptions { rezWindow: 'affordable' | 'always'; deckSet: DeckSet }  // DEFAULT_OPTIONS = {rezWindow: 'affordable', deckSet: 'core'}
// 'core' = 30-card decks + identities (hot-seat and online); 'starter' = Sprint 7 15/17-card decks, no identities (test fixture)
// PlayerState += identity: string | null; brainDamage: number; installedThisTurn: CardType[]
//   (installedThisTurn reset for both sides at every turn_started; never in any view)
// RunState += firing: number | null      the sub being resolved while an in-run choice is open
type ChoiceKind = 'free_rez' | 'trash_target' | 'prevent_trash';
// ChoiceState += target?: uid (prevent_trash: the card that would be trashed); resume: 'action' | 'run'
const IDENTITY_UID = { corp: 'id:corp', runner: 'id:runner' };
maxHandSize(state, side) = 5 − brainDamage    // exported
```

### Rules
- Discard step: down to `maxHandSize` (never below 0 cards). A Runner `end_turn` with `maxHandSize < 0` → `game_over{corp, flatline}` at once (no discard step, no `turn_ended`).
- Brain damage: `brainDamage += amount` first, then `amount` random Grip cards (seeded RNG) to the Heap; more damage than cards = flatline (all go, as net damage).
- `installCost`: an `installDiscount` applies when no card of its `types` is in `installedThisTurn` (the first matching install uses it up, even a free one); min 0. `whenYouInstall` fires after `card_installed` (and any `onInstall`) when `installedThisTurn` held nothing of its types before this install.
- Turn start order: `turn_started` → reset → `onTurnStart` / recurring refills (Adonis takes 3; emptied → trashed; empty remote pruned) → the Corp's draw.
- Choices inside a run (`trash_installed`): 0 candidates = nothing (`amount` 0); 1 = that card (no window); ≥ 2 → `choice_opened{trash_target, player: corp, cardId: ICE}`, `phase: 'choice'`, `run` kept (step `encounter`, `firing` = sub). A target with a preventer in the rig (`trashPrevention` covers its type; not itself) → `choice_opened{prevent_trash, player: runner, cardId: ICE, target}`. On close the phase returns to `'run'`, `subroutine_resolved` for `firing` (`amount` 1 trashed / 0 saved), then the remaining subs fire. A trashed breaker's boosts are dropped.

### Actions
- **New** `{type: 'choose', player, uid}` — `trash_target`: a candidate uid (Corp); `prevent_trash`: a preventer uid (Runner). Checks: `invalid_action` → `game_over` → `not_your_turn` (`waitingOn`) → `wrong_phase` (no open choice of these kinds) → `bad_target`.
- `pass` in `prevent_trash` = let it be trashed; in `trash_target` = `bad_target` (mandatory). `rez` in a non-`free_rez` choice = `wrong_phase`.
- `use_ability` += `subs?: number[]` — required for `count: 2` breaks (1–2 distinct unbroken subs, ascending; `sub` absent → else `bad_target`), forbidden for any other ability (`invalid_action`, shape check). One payment, one `subroutine_broken` per sub.

### Events (all public)
- `ability_triggered.trigger` += `'install' | 'install_discount' | 'rez'` (uid may be an identity uid; `install_discount` only when it lowered the price, right before `credits_spent`).
- `clicks_gained {player, amount}` · `brain_damage {amount, cardIds, maxHandSize}` · `corp_card_trashed {uid, cardId, server}` (to Archives face up) · `trash_prevented {uid, cardId, byUid, byCardId}` · `choice_opened.target?`.
- Sequences: Corp first install: `card_installed` → `ability_triggered{id:corp, install}` → `credit_gained{corp, 1}`. Kate: `ability_triggered{id:runner, install_discount}` → [`credits_spent`] → `card_installed`. Rez with `onRez` (Adonis): `credits_spent` → `card_rezzed` → `ability_triggered{rez}` → `hosted_credits_changed{12}`. Adonis at turn start: `ability_triggered{turn_start}` → `hosted_credits_changed` → `credit_gained` → (`corp_card_trashed` → `server_removed`). Rototurret: `subroutine_fired` → (`choice_opened` … `choice_closed`)* → `rig_card_trashed` (the target, or the Construct then `trash_prevented`) → `subroutine_resolved{op: 'trash_installed'}`.

### View
- `PlayerSideView` += `identity: {uid, cardId} | null`, `maxHandSize`, `brainDamage`.
- `CardOption` += `discount?` (install options: credits off, only when > 0; `cost` is already the lowered price).
- `ChoiceView` += `target?`. Options: `trash_target` = one `choose` per candidate (rig order); `prevent_trash` = one `choose` per preventer (rig order), then `pass`. `view.run` stays set while an in-run choice is open (its `options` are empty then; `choice.options` has the moves).
- `installedOptions` (Corp) lists rezzed cards' click abilities (Melange: `activate`, `clicks: 3`, `gain: 7`). Breaker options for `count: 2`: one `use_ability` per subset of unbroken subs of size 1–2 (ascending; Heimdall: 6).

- **QA-S8-2 (added in QA round 1, ui-dev):** `RunView.breakAll: BreakAllView[]` — `{uid, credits, strengthCredits, breakCredits}` per icebreaker that can break every unbroken subroutine of the encountered rezzed ICE with the Runner's credits now. Computed like `letFire`: the breaker's own offered options are played on throw-away states (a break when one is accepted, the one breaking the most first; else a strength pump). Runner's view at `encounter` only; `[]` otherwise, for the Corp, when nothing is left to break, or when no breaker can do it all. Tests: `test/sprint08-break-all.test.ts`.

### Engine rulings within the interface (Sprint 8, engine-dev)
- `install_discount` is reported once per applying source, before `credits_spent` (and before `card_installed`). A Corp first install: `card_installed` → (`hosted_credits_changed` for recurring/onInstall, none on Corp cards) → `ability_triggered{id:corp, install}` → `credit_gained`. The just-installed card is never its own source.
- Breaker options for a `count: 2` break: every single subroutine (ascending), then every pair (ascending), e.g. Heimdall `[0] [1] [2] [0,1] [0,2] [1,2]`. All cost the ability's price.
- `RunView.letFire` while letting Rototurret fire with ≥ 2 programs (or a Construct) stops where the choice opens: `outcomes` = what resolved before it (none for sub 0), `ends: null`. With 0 or 1 unprotected program it shows `{op: 'trash_installed', amount: 0 | 1}` as usual.
- `brain_damage.maxHandSize` is the new maximum (after the damage); a flatline from brain damage still raises it.
- A Runner `end_turn` below max 0 gives only `game_over` (no `turn_ended`, no discard step).
- An empty remote is also pruned at turn start (Adonis emptied) and after a Corp `activate` (`server_removed`).
- AI: `trash_target` → the costliest offered program (card cost; first on a tie); `prevent_trash` → always save (first preventer).

### Protocol / host
- Test-mode `create.test.deckSet?: 'core' | 'starter'` (production ignores `test`; always `'core'`). `PROTOCOL_VERSION` stays 1. `ONLINE_OPTIONS = {rezWindow: 'always', deckSet: 'core'}`.
- `@overclock/match/testing`: `planToStep(seed, goal, maxActions?, options?)` plans on `options.deckSet ?? goalDeckSet(goal)` (Sprint 3–7 goals: `'starter'`; Sprint 8 goals: `'core'`) and returns `plan.deckSet`; `planBusyBoard(seed, goal?, maxActions?, deckSet = 'starter')` returns `deckSet`. Create the page's game with the plan's `deckSet`.

## Sprint 14 interface (pinned: implement exactly this; changes go through the architect)

Deck sync + online games with own decks (plan: `docs/sprints/sprint-14-tech-plan.md`). **No rule or card change: `RULES_VERSION` stays 5.** `SAVE_FORMAT` stays 2. `DECK_STORE_FORMAT` 1 → 2 (reads 1). **`PROTOCOL_VERSION` is 2** (since E4; message types use `typeof PROTOCOL_VERSION`, so always send `v: PROTOCOL_VERSION`, never a literal; `/health` reports `protocol: 2`).

Status: **E1–E4 are in.** E1 types (`packages/match/test/sprint14-interface.test.ts`, `packages/protocol/test/sprint14-interface.test.ts`); E2 merge property tests (`packages/match/test/sprint14-merge.test.ts`); E3 the deck service (`apps/server/src/{decks,locker,guard}.ts`, tests `sprint14-locker`/`sprint14-guard`, `npm run test:dev -w apps/server`); E4 the room speaks v2 and deals after both picks (`apps/server/test/sprint14-room.test.ts`). E5 adds the leak tests.

Room behaviour (E4), for the client:
- Host: `create {side, deck?}` → `seated`, `lobby` (or `deck_refused {problems}` and no game; the socket stays open, send `create` again). When a friend joins: `lobby {picking: true}`; when the friend has picked: `sync`. If the friend leaves before picking: `lobby` (no `picking`).
- Guest: `join` → `seated`, `choose {seat}` → send `pick {deck?}` → `sync` (or `deck_refused`, pick again). `leave` before the pick frees the seat (socket closed 1000 `'left'`). If the host leaves meanwhile the guest gets `error no_game`.
- `resume` before the deal: host → `lobby` (with `picking: true` if the guest is seated), guest → `choose` (pick again).
- `problems` = `checkDeck`'s `DeckProblem`s; an identity of the other side adds `{kind: 'wrong_side', cardId: <identity>}` first.
- Any frame with `v ≠ 2` → `error version` and close.

### Deck store format 2 (`@overclock/match`, `src/saved-decks.ts`)
- `DECK_STORE_FORMAT = 2`. `DeckTombstone = {id: string, deletedAt: number}` (ms). `DeckStore = {format: 2, decks: readonly StoredDeck[], deleted: readonly DeckTombstone[]}`. `StoredDeck` unchanged.
- `parseDeckStore(x: unknown): DeckStore | 'broken' | 'newer'` — reads formats 1 (any `deleted` ignored → `[]`) and 2 (`deleted` required: non-empty string ids, times ≥ 0); always returns format 2. Format ≥ 3 → `'newer'`. Duplicate tombstones → newest `deletedAt`. A deck and a tombstone with one id → newer wins, tie → the tombstone (so each id is in at most one list). Sprint 13 rules otherwise unchanged.
- `mergeDeckStores(a: DeckStore, b: DeckStore): DeckStore` — per id the newest of `updatedAt`/`deletedAt` wins; tie → tombstone, then the smaller canonical JSON. Commutative, associative, idempotent. Output order canonical: decks by `createdAt` then `id`; tombstones by `id`. Detached.
- `checkDeckUpload(x: unknown): DeckStore | UploadProblem`, `UploadProblem = 'broken' | 'newer' | 'too_big'` — `x` = object or JSON text. JSON text > `MAX_DECK_UPLOAD_BYTES` or > `MAX_STORE_DECKS` decks → `'too_big'`; `parseDeckStore` broken/newer → same; id > `MAX_DECK_ID_LENGTH` (deck or tombstone), name > `MAX_DECK_NAME_LENGTH`, > `MAX_DECK_CARD_ENTRIES` entries in a deck → `'broken'`; > `MAX_STORE_TOMBSTONES` tombstones → the oldest are dropped (not refused). Unknown ids / 4+ copies kept.
- Limits (exported): `MAX_DECK_UPLOAD_BYTES = 262144`, `MAX_STORE_DECKS = 200`, `MAX_STORE_TOMBSTONES = 500`, `MAX_DECK_ID_LENGTH = 64`, `MAX_DECK_NAME_LENGTH = 80`, `MAX_DECK_CARD_ENTRIES = 100`.

### Deck service (`@overclock/protocol`, `src/decks.ts`, re-exported from the package root)
- `DECKS_API_VERSION = 1`; `DECKS_NEW_PATH = '/v1/decks/new'`; `DECKS_SYNC_PATH = '/v1/decks/sync'`; `TEST_IP_HEADER = 'X-Overclock-Test-Ip'` (test mode only). The limits above are re-exported.
- `POST DECKS_NEW_PATH` body `DeckNewRequest = {v, store}` → `200 DeckNewReply = {v, code, store}`. `POST DECKS_SYNC_PATH` body `DeckSyncRequest = {v, code, store}` → `200 DeckSyncReply = {v, store}` (merged). Errors: `DeckErrorReply = {v, error: DeckApiError, retryAfterMs?}`, `DeckApiError = 'no_decks' | 'wait' | 'bad_store' | 'too_big' | 'version'`, `DECK_API_ERRORS`, `DECK_API_STATUS = {no_decks: 404, wait: 429, bad_store: 400, too_big: 413, version: 400}`. `retryAfterMs` only with `wait`.
- Codes: `DECK_CODE_LENGTH = 12`, `DECK_CODE_GROUP = 4`, `makeDeckCode(randomInt: (n: number) => number): string` (server), `isDeckCode(code: string): boolean` (normalised input), `formatDeckCode(code: string): string` (`KX4P-9MTR-QZ7D`), typed input via `normalizeCode` (now in `src/codes.ts`, still exported from the root with `CODE_ALPHABET`, `CODE_LENGTH`, `isGameCode`, `makeCode`).
- Client: `parseDeckReply(status: number, body: unknown): DeckReply`, `DeckReply = {ok: true, store: DeckStore, code?: string} | {ok: false, error: DeckApiError | 'bad_reply', retryAfterMs?: number}` (a `wait` without a usable `retryAfterMs` → 60000). Never throws.
- Server: `parseDeckRequest(kind: 'new' | 'sync', raw: string): DeckRequest`, `DeckRequest = {ok: true, code?: string, store: DeckStore} | {ok: false, error: DeckApiError}` — size → `too_big`, JSON/shape → `bad_store`, `v` → `version`, a malformed `sync` code (after `normalizeCode`) → `no_decks`, store via `checkDeckUpload`.
- Device memory: `DECK_SYNC_STORAGE_KEY = 'overclock.deckSync.v1'`, `StoredDeckSync = {server: string, code?: string, rev: number, syncedRev: number, lockUntil?: number}` (`code` absent until the first `new` or a link).

### Protocol v2 messages (`@overclock/protocol`)
- `ProtocolVersion = typeof PROTOCOL_VERSION`; `PING`/`PONG` are built from the constant.
- `DeckChoice = {identity: string, cards: Readonly<Record<string, number>>}`; `isDeckChoice(x: unknown)`: identity 1–64 chars, ≤ `MAX_DECK_CARD_ENTRIES` entries, ids 1–64 chars, counts whole 1…`MAX_STORED_COPIES`.
- Client → server: `create {side, deck?: DeckChoice, test?}`; new `pick {deck?: DeckChoice}` (joiner, after `choose`; absent = standard). Until E4 the room answers `pick` with `error bad_message`.
- Server → client: `lobby` gains `picking?: true`; new `choose {seat: Side}`; new `deck_refused {problems: readonly DeckProblem[]}` (parser: an array of ≤ 500 objects with a string `kind`).

## Sprint 13 interface (pinned: implement exactly this; changes go through the architect)

Deck builder (plan: `docs/sprints/sprint-13-tech-plan.md`). **No rule or card change: `RULES_VERSION` stays 5.** `SAVE_FORMAT` 1 → 2 (E3). `PROTOCOL_VERSION` stays 1; online games and the room never take `decks`.

Status: **E1–E3** are in. E2: the deck helpers are pinned by `packages/cards/test/sprint13-decks.test.ts`. E3: `GameOptions.decks` **deals** (`newGame`, `LocalMatch`, `HotSeat`), `newGame` throws `illegal_deck`, `SAVE_FORMAT = 2` (format-1 saves load), tests `packages/engine/test/sprint13-custom-decks.test.ts` (deckStatus ≡ checkDeck ≡ newGame on 300 random decks) and `packages/match/test/sprint13-saves.test.ts` (golden `fixtures/sprint13-saves.json`). E4: `parseDeckStore` pinned by `packages/match/test/sprint13-saved-decks.test.ts`; RULES_SPEC "Deck building (Sprint 13)" and the GLOSSARY words (checked by `packages/cards/test/sprint13-docs.test.ts`).

### Deck rules helpers (`@overclock/cards`, `src/deck.ts`; all built on `checkDeck`)
- `IDENTITIES: Readonly<Record<Side, string>>` — `{corp: 'c13', runner: 'r13'}` (Haas-Bioroid, Kate).
- `STANDARD_DECKS: Readonly<Record<Side, DeckDef>>` — the `core45` decks (read-only; ids `'standard-corp'` / `'standard-runner'` on the client, never stored).
- `deckPool(side: Side): readonly DeckPoolGroup[]`, `DeckPoolGroup = {type: CardType; cards: readonly CardDef[]}` — every non-identity card of `side` (Corp 24, Runner 20). Groups in order Corp `agenda, ice, asset, upgrade, operation` / Runner `event, hardware, resource, program`; by name inside a group; empty groups left out.
- `deckStatus(deck: DeckDef): DeckStatus` = `{size, minSize, influence, influenceLimit, agendaPoints, agendaRange: {min, max} | null, problems: readonly DeckProblem[], legal: boolean}`. `minSize` = the identity's own (45); `agendaRange` null for the Runner; `problems` = `checkDeck(deck)`; `legal === (problems.length === 0)`.
- `addBlock(deck: DeckDef, cardId: string): AddBlock | null` — why the editor's **+** is dimmed (null = allowed). Runs `checkDeck` on the deck plus one copy:
  `{kind: 'max_copies', limit}` | `{kind: 'agenda_faction', identityFaction: Faction, cardFaction: Faction}` | `{kind: 'wrong_side'}` | `{kind: 'unknown_card'}` (also for an identity id). Influence and agenda points never block.
- `countsOf(deck: DeckDef): Record<string, number>` — id → copies (identity not counted).
- `deckFromCounts(identity: string, counts: Readonly<Record<string, number>>): DeckDef` — canonical order (`ALL_CARDS` order, copies adjacent); counts < 1 dropped, fractions floored; unknown ids kept at the end (sorted) so `checkDeck` reports them.
- Unchanged: `checkDeck`, `DeckProblem`, `deckInfluence`, `deckAgendaPoints`, `MAX_COPIES`.

### Game options (`@overclock/engine`)
- `GameOptions.decks?: Partial<Record<Side, DeckDef>>` — a side given here is dealt instead of `deckSet`'s deck. `resolveOptions` keeps the key **only when present** (standard games' state and hashes unchanged). An empty `decks` (`{}`, or only `undefined` sides) counts as absent. Additive (E3): `isPlayableDeck(deck, side): boolean` — exactly the check `newGame` makes (`checkDeck` clean and the identity is `side`'s); `parseSavedGame` uses it too. `newGame` throws `Error('illegal_deck')` if a given deck fails `checkDeck` or its identity is the other side's. The client passes `decks` only for non-standard picks: `new HotSeat(seed, {decks})`.

### Saved games (`@overclock/match`, E3)
- `SAVE_FORMAT = 2`; `parseSavedGame` accepts formats 1 and 2, keeps `options.decks` (identity string, ≤ 200 string ids per side), returns `'broken'` if a saved deck fails `checkDeck`. Continue never reads the deck store. A format-1 save is returned as format 2 without `decks` (any `decks` field in a format-1 save is ignored, as Sprint 12 did); a loaded game re-saves as format 2. `MAX_SAVED_DECK_CARDS = 200` is exported. `LocalMatch.save()` deep-copies the options (deck lists detached).

### Deck store format (`@overclock/match`, `src/saved-decks.ts`)
- `DECK_STORE_FORMAT = 1`.
- `StoredDeck = {id: string (client UUID), side: Side, name: string, identity: string, cards: Readonly<Record<string, number>>, createdAt: number, updatedAt: number}` (ms).
- `DeckStore = {format: 1, decks: readonly StoredDeck[]}`.
- `parseDeckStore(x: unknown): DeckStore | 'broken' | 'newer'` — `x` = parsed object or raw JSON string; returns a detached copy. Unknown card ids are kept. `'broken'`: the client copies it to `overclock.decks.v1.bak`; `'newer'`: list shown read-only. E4 details: counts must be whole numbers 0…`MAX_STORED_COPIES` (200, exported) or the store is `'broken'`; counts of 0 are dropped; over-limit counts (4+) and decks whose identity is the other side's are kept (not Ready); two decks with the same `id` → the newest `updatedAt` is kept, in the first one's place; unknown fields are dropped.
- Client I/O (`apps/client/src/deckStore.ts`): `localStorage['overclock.decks.v1']`.

## Sprint 12 interface (pinned: implement exactly this; changes go through the architect)

**E1–E5 status (engine-dev):** interface, Accelerated Beta Test, Archived Memories, Experiential Data, The Toolbox, Modded, Infiltration, the 45-card decks (`'core45'` default everywhere), `RULES_VERSION = 5`, golden saves (`sprint11-saves.json` re-pinned for the version only, hashes unchanged; `sprint12-saves.json`), `SPRINT12_GOALS`, hidden-info checks, 300-game property test (`test/sprint12-properties.test.ts`). E6 (AI, `packages/ai`): `look_install` = every looked-at ICE onto the existing server with the fewest ICE, then Done; `archives_pick` = most agenda points, then highest cost; the Corp scores whenever offered (DECISIONS 2026-11-18).

Everything in the Sprint 1–11 interfaces still holds unless noted. Tech plan: `docs/sprints/sprint-12-tech-plan.md`. **`RULES_VERSION = 5`** (decks and rules change: Sprint 11 saves and online games load `outdated`). `PROTOCOL_VERSION` stays 1 (additive). No engine or client code checks a card id.

### Card DSL v5 (`@overclock/cards`, additive)
```ts
type Effect = ...
  | { op: 'look_install_top'; count: number; types: CorpCardType[] }        // ABT onScore (last effect; opens look_install)
  | { op: 'archives_to_hand' }                                               // AM onPlay (last effect; opens archives_pick)
  | { op: 'install_from_hand'; types: RunnerCardType[]; discount: number }   // Modded (target = play.installIndex)
  | { op: 'expose' };                                                        // Infiltration mode 1 (target = play.uid)
type PlayCondition = ... | 'corp_archives_not_empty' | 'has_install_target';
interface CardMode { label: string; effects: Effect[] }
// CardDef += iceStrengthBonus?: number (rezzed upgrade: ICE protecting its server) · modes?: CardMode[]
//            (instead of onPlay) · code?: string (NetrunnerDB, e.g. '01055') · unique?: true
```
New ids: c23 Accelerated Beta Test, c24 Archived Memories, c25 Experiential Data, r19 The Toolbox, r20 Modded, r21 Infiltration. Every non-identity card has `code`, `faction` and an integer `influence ≥ 0`.

### Decks and options
```ts
type DeckSet = 'core45' | 'core' | 'starter';
// 'core45' (default: DEFAULT_OPTIONS, hot-seat, ONLINE_OPTIONS) = CORP_CORE45_DECK / RUNNER_CORE45_DECK (45 + identities)
// 'core' = the 30-card Sprint 11 decks, frozen as a test fixture (seeded specs keep their situations)
// resolveOptions: 'core' → 'core', 'starter' → 'starter', anything else → 'core45'
```

### Actions
```ts
| { type: 'select'; player; card: number; server?: ServerId | 'new' }
//   invalid_action (card integer, server absent or a string) → game_over → not_your_turn (waitingOn)
//   → wrong_phase (no open look_install / archives_pick) → bad_target
//   look_install: card = index into choice.looked whose card is ICE; server = existing id or 'new' (required)
//   archives_pick: card = Archives index ≠ the copy being played; server absent
| { type: 'play'; player; handIndex; server?; installIndex?: number; mode?: number; uid?: string }
//   checks: invalid_action → playExtrasShape (installIndex/mode integers, uid string) → … → bad_card → bad_target
//   → not_implemented → condition_not_met → no_credits → no_memory
//   bad_target: installIndex on a card without install_from_hand, or not one of its Grip targets (index
//     BEFORE playing, never handIndex; missing while a target exists); mode on a card without modes, or
//     missing / out of range; uid when the chosen effects don't expose, or not a face-down installed Corp card
//   condition_not_met: Modded with no program/hardware in the Grip (the one `play` without installIndex);
//     Archived Memories with Archives empty
//   no_credits: Modded counts its own cost + the install price; no_memory: Modded's program doesn't fit
```
`pass` in `archives_pick` = `bad_target` (mandatory); in `look_install` = Done. `rez` / `choose` / `trace_bid` in the new choices = `wrong_phase`.

### Choices (`phase: 'choice'`, `resume: 'action'`, `waitingOn` = Corp)
- **`look_install`** (Accelerated Beta Test scored, not winning): the top `min(3, R&D)` cards leave R&D into `ChoiceState.looked` (R&D 0 = nothing happens, no event, never a loss). Events: `agenda_scored`, `cards_looked_at{count, cardIds}` (cardIds Corp only), `choice_opened{look_install, corp, cardId: 'c23'}`. Options: one `select{card, server}` (cost 0) per looked ICE × (servers in `corpServers` order, then `'new'`), then `pass` (Done). `select` → [`server_created`] → `card_installed{player: corp, uid, zone: 'ice', server, cardId}` (no handIndex; Runner loses cardId) → `ice_rezzed{uid, cardId}` → [HB: `ability_triggered{id:corp, install}`, `credit_gained 1`]; no click, no credits, no ICE install tax; the card leaves `looked`; the choice stays open, and closes by itself (`choice_closed{skipped: false}`) when `looked` is empty. `pass` → `choice_closed{skipped: true}` → `rd_cards_trashed{count, cardIds}` (cardIds Corp only; the cards go to Archives **face down**, in looked order).
- **`archives_pick`** (Archived Memories played; Archives had ≥ 1 card before): `card_played` → `choice_opened{archives_pick, corp, cardId: 'c24'}`. Options: one `select{card}` per Archives index except the copy being played (`ChoiceState.ownIndex`), ascending. `select` → `choice_closed{skipped: false}` → `card_returned_to_hand{player: corp, archivesIndex, faceUp, cardId}` (the card goes to the end of HQ; the Runner's projection keeps `cardId` only when `faceUp`).

### Strength (Experiential Data)
`iceStrength(state, ice)` = printed + advancements × `strengthPerAdvancement` + every rezzed `iceStrengthBonus` in its server's cards (central or remote). Used by `too_weak`, `RunView.ice.strength`, break-all, the planner. **`InstalledView.strength?: number`** on ICE the viewer can see (Corp: all its ICE; Runner: rezzed) — the board badge.

### Modded / Infiltration (no choice phase; the target travels in `play`)
- Modded hand options: one `play{handIndex, installIndex}` per Grip program/hardware (Grip order); `cost` = the install price (card cost − 3 − Kate's 1 on the turn's first program/hardware, ≥ 0; Modded itself costs 0), `discount` (only when > 0) = printed cost − `cost`; `reject` may be `no_credits` / `no_memory`. No target → one `play{handIndex}` with `condition_not_met`. Play: `credits_spent`? (Modded 0: none) … `card_played{Modded}` → [`ability_triggered{id:runner, install_discount}`] → [`credits_spent{install price}`] → `card_installed{player: runner, zone: rig, uid, handIndex (in the hand after Modded left), cardId}` → [`hosted_credits_changed`] (Toolbox: 2). No extra click; it counts as the turn's install for Kate.
- Infiltration hand options: `play{handIndex, mode: 0}` (Gain 2 credits) then `play{handIndex, mode: 1, uid}` per face-down installed Corp card (servers in order, ICE innermost first, then content). Mode 1 → `card_played` → **`card_exposed{uid, cardId, server}`** (public: both projections keep `cardId`). No state change; the card stays face down.
- The Toolbox: data only (`memoryBonus 2`, `link 2`, `recurringCredits {2, icebreaker}`); pays icebreaker breaks and pumps only, refilled at the Runner's turn start.

### View
```ts
interface InstalledView { /* … */ strength?: number }                 // ICE the viewer can see
interface ChoiceView { /* … */ looked?: (string | null)[] }             // look_install only; Runner: nulls
```

### Events (new)
`cards_looked_at{count, cardIds?}` · `rd_cards_trashed{count, cardIds?}` (cardIds stripped for the Runner) · `card_returned_to_hand{player, archivesIndex, faceUp, cardId?}` (Runner: cardId only when faceUp) · `card_exposed{uid, cardId, server}` (public).

## Sprint 11 interface (pinned: implement exactly this; changes go through the architect)

Everything in the Sprint 1–10 interfaces still holds unless noted. Tech plan: `docs/sprints/sprint-11-tech-plan.md`. **No rule changes: `RULES_VERSION` stays 4** (live online games survive the deploy). `PROTOCOL_VERSION` stays 1 (additive optional fields only). No engine, card, view or event changes.

**E1 status:** `LocalMatch` keeps an accepted-only log; `save()` / `LocalMatch.load()`; `SavedGame`, `SAVE_FORMAT`, `parseSavedGame`, `LoadResult`, `LoadFailure` exported from `@overclock/match`; golden save fixture (`packages/match/test/fixtures/sprint11-saves.json`).

### Saved games (`@overclock/match`, `src/saved-game.ts`)
```ts
const SAVE_FORMAT = 1;
interface SavedGame {            // plain JSON; ~30–60 KB for a 400-move game (pretty-printed less)
  format: 1;
  rulesVersion: number;          // RULES_VERSION the game was played under
  seed: number;                  // uint32
  options: GameOptions;          // {rezWindow, deckSet}, defaults filled in
  actions: Action[];             // every ACCEPTED action, in order
}
type LoadFailure = 'broken' | 'outdated' | 'finished';
type LoadResult = { ok: true; match: LocalMatch } | { ok: false; reason: LoadFailure };

class LocalMatch {
  save(): SavedGame;                       // detached copy of the log; no state; cheap (call after the move's presentation)
  static load(x: unknown): LoadResult;     // x = the SavedGame object or its JSON string; never throws
  actions(): readonly Action[];            // Sprint 11: accepted actions only (was: everything that reached the engine)
}
parseSavedGame(x: unknown): SavedGame | 'broken' | 'outdated';   // shape check only (load uses it)
```
- `load` order: shape → `broken` (not JSON, not an object, `format` not 1, bad `rulesVersion`/`seed`/`options`, an action without a string `type` and a side `player`); a **higher** integer `format` → `outdated`; `rulesVersion !== RULES_VERSION` → `outdated`; replay with `apply` — **any** action refused → `outdated` (the rules changed under the save without a bump), a throw → `broken`; the replayed game is over (`phase 'over'` / `result`) → `finished`; else `{ok: true, match}` with `match.save()` equal to the input's fields.
- `submit` no longer logs refused actions (a seat mismatch never was). `replay(seed, actions(), options)` still rebuilds the game; `restore` / `fromSnapshot` are unchanged.
- Restore cost: replay only (no views), a 400-action game loads in well under 50 ms in Node (`sprint11-save.test.ts`).
- Golden fixture: `test/saved-game.test.ts` pins the sha256 of the state three saved games (core, core online rules, starter; up to 406 actions) replay to. Any engine/card change that alters replay fails it: **bump `RULES_VERSION`**, then re-pin with `UPDATE_FIXTURES=1 npx vitest run test/saved-game.test.ts` (from `packages/match`).
- Client storage (ui-dev): `localStorage['overclock.hotseat.v1'] = JSON.stringify(match.save())`; one slot.

**E3 status:** `packages/match/test/sprint11-save.test.ts`: 300-game save → JSON → `load` property test (state, both views and save deep-equal at a random point, mid-run/choice/discard included; the next 20 moves give equal updates; restored Runner view passes `runnerViewLeaks`, the Corp view has no Grip), `finished` on 30 real finished games (flatline, decked, points), `broken` on every cut of a save's JSON and random damage, `outdated` on other `RULES_VERSION`s and on reordered moves; a 400-action game restores in ~1 ms (limit 50 ms). Golden fixture also pins two planned breaker games (Heimdall 1.0 vs Battering Ram, Ice Wall vs Ram). `planToStep` goal `ice_wall_ram_gordian` (`SPRINT11_GOALS`). Sprint 11 engine work is complete.

**E2 status:** online Leave for now and the 7-day limit (`apps/server/src/room.ts`, `packages/protocol`).

### Protocol (additive, still v1) and room
```ts
// ServerMsg (optional flag; older builds ignore it and just see 'away'):
| { v: 1; t: 'presence'; opponent: Presence; left?: true }          // left only with opponent 'away'
| { v: 1; t: 'sync'; seq; view; opponent: Presence; left?: true }   // the opponent is away because they left for now
// ClientMsg 'leave' (unchanged shape): lobby nobody joined → the room closes (Sprint 7);
//   started game → Leave for now.
interface StoredSeat { server; code; seat; token; rulesVersion?: number; savedAt?: number }   // Sprint 11 optional fields
// apps/server: IDLE_TTL_MS = 7 days (was 3); RoomMeta.left?: Partial<Record<Side, true>>
```
- `leave` from a seated socket in a **started** game (also a finished one): `meta.left[seat] = true`, `meta.lastActive = now` (the 7 days count from the last move **or** leave), that socket is closed `1000 'left'` (it hears nothing first), the other seat (if connected) gets `presence {opponent: 'away', left: true}`. The game, its log and both tokens are kept; a left Corp is never auto-passed for. A parser refuses `left` other than `true`, or with `opponent` other than `'away'`.
- `resume` with a left seat's token clears `meta.left[seat]`: the resumer gets `sync` (opponent as usual), the other seat `presence {opponent: 'here'}` (no flag).
- Any `sync` to a seat whose opponent is left (e.g. it reconnects) carries `left: true`; an opponent whose phone merely dropped is `away` with no flag.
- `meta.left` is stored, so it survives hibernation and a deploy (restore by snapshot or replay). Expiry: `error expired` to open sockets and storage wiped at `lastActive + IDLE_TTL_MS`; a later `resume` gets `no_game`.

## Sprint 10 interface (pinned: implement exactly this; changes go through the architect)

Everything in the Sprint 1–9 interfaces still holds unless noted. Tech plan: `docs/sprints/sprint-10-tech-plan.md`. `RULES_VERSION = 4` (live online games expire on deploy). `PROTOCOL_VERSION` stays 1. No new events, no new view fields.

**E1 status:** types (`take_credits.amount: 'chosen'`, `activate.amount`), the `activateAmount` check (last in `activate`), `abilityGain(installed, ability, amount?)`, `'chosen'` resolution, `RULES_VERSION = 4`. Bank Job still takes all until E3.

**E4 status:** `SPRINT10_GOALS` (10 goals, see the `@overclock/match` section). Sprint 10 engine work is complete.

**E3 status:** Bank Job (r10) uses `take_credits{amount:'chosen'}`, label "Take credits"; step `success` lists one `activate` per amount 1..N then `pass` (shared `abilityOptions`, also used for click abilities); the AI Runner takes the highest offered amount; 300-game property run and online room parity (`apps/server/test/sprint10-parity.test.ts`).

**E2 status:** advance cap on (`belowRequirement` → `condition_not_met`, `atAdvanceLimit(state, uid)` exported from `rules.ts`); `installedOptions` lists only `score` for an agenda at its requirement; Ice Wall unchanged; the AI is never offered it.

### Card DSL (`@overclock/cards`, additive)
```ts
| { op: 'take_credits'; amount: number | 'all' | 'chosen' }   // 'chosen': the player names 1..hosted credits in `activate.amount`
// Bank Job (r10): cardAbilities[0] = { label: 'Take credits', when: 'successful_run_remote', clicks: 0, credits: 0,
//   requires: 'hosted_credits', replacesAccess: true, effects: [{ op: 'take_credits', amount: 'chosen' }] }
```

### Actions
```ts
| { type: 'activate'; player; uid; ability; amount?: number }
//   checks: … → activateCredits → activateAmount:
//   invalid_action: amount given but not an integer; given for an ability with no 'chosen' effect; missing for one with it
//   bad_target: amount outside 1..the card's hosted credits
| { type: 'advance'; player; uid }
//   checks: … → hasClick → ownAdvanceable → belowRequirement → canAffordAdvance
//   belowRequirement: an installed agenda with advancements >= advancementRequirement → condition_not_met
//   (advanceable ICE: no limit). Rejections go only to the sender's seat.
```

### Rules helpers
- `hasChosenAmount(ability)`; `abilityGain(installed, ability, amount?)` (a `'chosen'` take gives `amount`, capped at the card's credits).

### View (no new fields)
- Run step `success`: per usable `replacesAccess` ability with a `'chosen'` effect, **one `activate` option per amount 1..N** (N = hosted credits; `amount` set, `gain` = amount, cost 0), ascending; then `pass` (= Access cards). Mirrors `trace_bid`.
- Corp `installedOptions`: an agenda at its requirement lists only `score` (no `advance`); one short lists `advance` (and `score` only once it qualifies). Ice Wall unchanged.
- Taking every credit still trashes Bank Job (`trashWhenEmpty`); the run ends `access_replaced`. Events as Sprint 7 (`ability_triggered`, `hosted_credits_changed`, `credit_gained`, `rig_card_trashed`?, `run_ended`).

### AI
- Runner at step `success`: takes the highest offered amount. Corp: never sees `advance` on an agenda at its requirement.

## Sprint 9 interface (pinned: implement exactly this; changes go through the architect)

Everything in the Sprint 1–8 interfaces still holds unless noted. Tech plan: `docs/sprints/sprint-09-tech-plan.md`. No engine or client code checks a card id. `RULES_VERSION = 3` (live online games expire on deploy). `PROTOCOL_VERSION` stays 1.

**E7 status:** hidden-information allowlists (trace events / trace choices name the face-up card that started the trace; a scored agenda's `ability_triggered`), 300-game Sprint 9 property test, AI (trace bids, PSF, trash the costliest resource, remove a tag with ≥ 4 credits), room parity tests, `SPRINT9_GOALS` (below). Sprint 9 engine work is complete.

**E6 status:** `lastSuccessfulRunTurn` is set at every `run_successful` (a Bank Job run counts); SEA Source and Ichi 1.0 work (nothing cut).

**E5 status:** `meat_damage` (shared net/brain damage code; flatline when more than the Grip), `scoredAbilities` usable through `activate` with a scored uid `score:corp:<i>` (Corp score area only), listed in the Corp's `installedOptions` under that key. Private Security Force works.

**E4 status:** tags work: `remove_tag`, `trash_resource` (`rig_card_trashed{cause:'tagged'}`), Runner `basicOptions`, Corp `installedOptions` per rig resource while tagged; tags never reset.

**E3 status:** traces work (`trace` effect, both windows with the skip rules, `trace_bid`, in-run resume and action resume, `give_tags`); the stub AI bids (Corp: least that beats the Runner's best answer, else 0; Runner: `needed`).

**E1 status:** every type below exists; the new actions are validated in the pinned check order and then refused `not_implemented` (stub check `notBuiltYet`, removed in E3/E4); the `trace` / `give_tags` / `meat_damage` effects are no-ops until E3–E5; `basicOptions` is `[]` and scored abilities are not offered until E4/E5; `lastSuccessfulRunTurn` is set from E6. Views are complete (tags, link, `choice.trace`, trace bid options).

### Card DSL v4 (`@overclock/cards`, additive)
```ts
type Effect = ...
  | { op: 'trace'; base: number; onSuccess: Effect[] }   // last effect of an onPlay; onSuccess ops ⊆ TRACE_SUCCESS_OPS
  | { op: 'give_tags'; amount: number }
  | { op: 'meat_damage'; amount: number };
const TRACE_SUCCESS_OPS = ['give_tags', 'brain_damage', 'net_damage', 'meat_damage', 'gain_credits'] as const;  // exported
type TraceSuccessOp = (typeof TRACE_SUCCESS_OPS)[number];
type CardAbilityRequirement = 'hosted_credits' | 'runner_tagged';   // CardAbility.requires
type PlayCondition = 'runner_ran_last_turn' | 'runner_successful_run_last_turn';
// CardDef.link?: number           now also Runner rig cards (Access to Globalsec: 1)
// CardDef.scoredAbilities?: CardAbility[]   Corp agendas only, when: 'click' only (Private Security Force)
```
- New ids (E2): c20 Hunter, c21 Ichi 1.0, c22 SEA Source, r18 Access to Globalsec; c09 PSF gets `scoredAbilities: [{label: 'Do 1 meat damage', when: 'click', clicks: 1, credits: 0, requires: 'runner_tagged', effects: [{op: 'meat_damage', amount: 1}]}]`.

### State
```ts
// PlayerState += tags: number                       Runner; always 0 for the Corp
// GameState  += lastSuccessfulRunTurn: number | null   set at every run_successful
type ChoiceKind = 'free_rez' | 'trash_target' | 'prevent_trash' | 'trace_corp' | 'trace_runner';
interface TraceState {
  base: number;
  strength: number | null;   // base + Corp bid; null while the Corp bids
  corpBid: number | null;
  onSuccess: Effect[];
}
// ChoiceState += trace?: TraceState   cardId = the ICE or operation; in a run resume: 'run' + run.firing = the sub; SEA Source resume: 'action'
scoredUid(side, index) => `score:${side}:${index}`      // exported
parseScoredUid(uid) => {side, index} | null              // exported
runnerLink(state) = identity link + Σ rig cards' link     // exported
BASIC_ACTION_COST = 2                                     // exported (remove_tag, trash_resource; + 1 click)
```

### Trace flow
- `trace_started{cardId, base, link}` → Corp window (`trace_corp`) → Runner window (`trace_runner`) → `trace_resolved` → `onSuccess` effects → (in a run) `subroutine_resolved{op: 'trace', amount: 1 success / 0 fail}` (before any `run_ended` / `game_over`, via `beforeEnd`) → remaining subs.
- **Success iff strength > link + Runner bid** (ties: Runner).
- Windows open only when the bid can matter (all inputs public): Corp iff credits > 0 **and** base + credits > link; Runner iff 0 < strength − link ≤ Runner max bid. A skipped side bids 0: `trace_bid{player, credits: 0, total, auto: true}`, no `choice_opened`.
- Max bids: Corp = its credits; Runner = credits + `run.tempCredits` (paid temp-first). Recurring credits are not used.
- Hunter in a run: `subroutine_fired` → `trace_started` → (`choice_opened{trace_corp}` → `choice_closed` → `credits_spent`)? → `trace_bid{corp}` → (`choice_opened{trace_runner}` → `choice_closed` → `credits_spent`)? → `trace_bid{runner}` → `trace_resolved` → `tags_changed` → `subroutine_resolved` → `ice_passed` …

### Actions
```ts
| { type: 'trace_bid'; player: Side; credits: number }
//   invalid_action (non-negative integer) → game_over → not_your_turn (waitingOn) → wrong_phase (no open trace choice) → no_credits (> max)
//   `pass` in a trace choice = bad_target (bid 0 is the default)
| { type: 'remove_tag'; player: Side }                 // Runner, 1 click + 2 credits
//   invalid_action → game_over → not_your_turn → wrong_phase (own action phase) → no_clicks → condition_not_met (0 tags) → no_credits
| { type: 'trash_resource'; player: Side; uid: string }  // Corp, 1 click + 2 credits → rig_card_trashed{cause: 'tagged'}
//   invalid_action → game_over → not_your_turn → wrong_phase → no_clicks → condition_not_met (untagged) → bad_target (not a rig resource) → no_credits
```
- `activate.uid` may be a scored uid `score:corp:<i>`: `ability` indexes that agenda's `scoredAbilities` (Corp, own action phase); `requires: 'runner_tagged'` untagged → `condition_not_met`.
- A Corp sending `remove_tag` gets `condition_not_met` (the Corp never has tags); a Runner sending `trash_resource` is `not_your_turn` on the Corp's turn, else `bad_target` once tagged.

### Events (all public)
- `trace_started{cardId, base, link}` · `trace_bid{player, credits, total, auto?: true}` (after its `credits_spent`; `total` = strength for the Corp, link + bid for the Runner) · `trace_resolved{cardId, strength, total, success}` · `tags_changed{amount /* +n or −1 */, tags}` · `meat_damage{amount, cardIds}` (flatline as net damage) · `rig_card_trashed.cause?: 'tagged'` · `choice_opened` / `choice_closed` with the new kinds.

### View
```ts
// PlayerSideView += tags: number; link: number      (Corp: 0, 0)
interface TraceView {            // ChoiceView.trace?, both viewers
  base: number;
  strength: number;              // base until the Corp has bid
  corpBid: number | null;
  link: number;
  runnerMaxBid: number;
  corpMaxBid: number;
  needed: number;                // max(0, strength − link): Runner credits to tie = escape
}
// ChoiceView options (deciding viewer only): one trace_bid per amount 0..max, cost = amount
// PlayerView += basicOptions: CardOption[]   Runner: remove_tag (cost 2, clicks: 1) while tagged, with reject; Corp: []
```
- Corp `installedOptions` += per rig resource uid a `trash_resource` option (cost 2, `clicks: 1`) **only while the Runner is tagged**; += per scored agenda with `scoredAbilities` (key `score:corp:<i>`) its `activate` options, always listed (reject `condition_not_met` when untagged).
- `RunView.letFire` stops where a trace opens (as Rototurret's choice).

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

**Test-only (Sprint 4):** three more `planToStep` goals:
- `corp_score_hostile_takeover` — Corp's action step, an installed Hostile Takeover ready to score (scoring does not win). `info: {uid, cardId, server}`. Tapping Score: +7 credits, bad publicity 1.
- `corp_score_priority_requisition` — Corp's action step, an installed Priority Requisition ready to score (scoring does not win) and ≥ 1 face-down ICE installed, so Score opens the free-rez choice. `info: {uid, cardId, server, iceUid}` (`iceUid` = the first offered ICE). Works unless Priority Requisition is the bottom card of R&D (~94% of seeds 1-100; 1, 2, 3, 7, 42, 99, 12345 pinned in tests).
- `runner_run_with_bad_publicity` — Runner's action step with a click, the Corp at ≥ 1 bad publicity (Hostile Takeover scored), cards in HQ. A run on HQ then stops at access with `run.tempCredits` > 0; Done ends the run (`temp_credits_lost`). `info: {server: 'hq', badPublicity}`.
The planner answers a free-rez choice it did not aim for with Skip.

**Test-only (Sprint 5):** four more `planToStep` goals (all seeds 1-100 and 12345 work, tested on 1-40 plus 42, 99, 12345):
- `enigma_encounter` — the Runner encounters a rezzed Enigma (the only ICE on a new remote) with ≥ 1 click and `pass` offered; `run.letFire` = lose 1 click, end run. `info: {server, iceUid}`.
- `neural_katana_encounter` — the same with Neural Katana and ≥ 3 cards in the Grip; `letFire` = 3 net damage, `ends: null`. `info: {server, iceUid}`.
- `runner_at_access` — the access step of a run on Archives showing ≥ 2 cards at once (no ICE on Archives). `info: {server: 'archives', count}`.
- `runner_after_access` — the same run finished (agendas stolen, Done): Runner's action step, `lastRun` lists ≥ 2 cards, ≥ 1 click left. `info: {server: 'archives', count}`.

**Test-only (Sprint 8):** thirteen `planToStep` goals on the **core decks** (`SPRINT8_GOALS`; `plan.deckSet === 'core'`; create the page's game with the same options). All work for seeds 1-100 and 12345, pass-the-phone and online (`{rezWindow: 'always'}`); tests pin 1, 7, 42, 12345. The legacy goals (`STEP_GOALS`) keep planning on `'starter'`.
- `corp_first_install` — Corp's action step, all 3 clicks, an install into a new remote legal (turn 1: `actions` may be `[]`). `info: {handIndex, cardId}`. Install → `ability_triggered{id:corp, install}`, `credit_gained 1`.
- `runner_kate_discount` — Runner's action step, all 4 clicks, Corroder and a resource in the Grip, ≥ 3 credits. `info: {corroderIndex, resourceIndex, resourceId}`. Corroder's option: `cost 1, discount 1`; installing the resource first leaves it at 1.
- `corp_rez_adonis` — Corp's action step, face-down Adonis Campaign, Rez legal. `info: {uid, server, cost: '4'}`. Rez → `hosted_credits_changed 12`.
- `adonis_before_corp_turn` — Runner's action step, a face-up Adonis Campaign holding ≥ 3 (usually 12). `info: {uid, server, credits}`. End turn → the Corp's turn starts with `ability_triggered{turn_start}`, hosted −3, `credit_gained 3`.
- `corp_melange` — Corp's action step, 3 clicks, face-up Melange Mining Corp. `info: {uid, server}`. Option `{activate, clicks 3, gain 7}`.
- `corp_biotic_labor` — Corp's action step, 3 clicks, Biotic Labor playable. `info: {handIndex}`. Play → clicks 2 + 2 = 4.
- `viktor_encounter` — encounter with a rezzed Viktor 1.0 alone on a remote, no code gate breaker, ≥ 2 Grip cards. `info: {server, iceUid}`. Pass → `brain_damage{maxHandSize: 4}`, run ended.
- `heimdall_corroder_encounter` — rezzed Heimdall 1.0, Corroder (strength 2), ≥ 7 credits. `info: {server, iceUid, breakerUid}`.
- `heimdall_ram_encounter` — rezzed Heimdall 1.0, Battering Ram (strength 3), ≥ 5 credits. `info: {server, iceUid, breakerUid}`. 3 pumps, then 6 break picks.
- ~~`pipeline_katana_encounter`~~ — **retired in Sprint 9** (Neural Katana left the core deck; `planToStep` throws). Use `pipeline_hunter_encounter`: rezzed Hunter, Pipeline (strength 1), ≥ 7 credits (3 pumps of 2 to strength 4, then 1 to break). `info: {server, iceUid, breakerUid}`.
- `runner_magnum_opus` — Runner's action step, ≥ 1 click, Magnum Opus installed. `info: {uid}`.
- `runner_sure_gamble` — Runner's action step, ≥ 1 click, exactly 5 credits, Sure Gamble in the Grip. `info: {handIndex}`.
- `rototurret_two_programs` — encounter with a rezzed Rototurret, ≥ 2 programs installed. `info: {server, iceUid, programs: 'uidA,uidB', construct: uid | ''}`. Pass → `trash_target` (Corp). **With Sacrificial Construct installed** (then `prevent_trash` follows the Corp's pick), Sprint 9 decks: seeds 11, 16, 20, 27, 30, 32, 35, 42, 43, 48, 51, 54, 56, 59, 62, 65, 67, 69, 92, 95; the other seeds of 1-100 and 12345 have none (e.g. 1, 2, 7). (Sprint 8 decks were 2, 6, 7, …, 12345.)
- Sprint 9 decks: `heimdall_corroder_encounter` fails on seed 80 (Heimdall 1.0 is the bottom card of R&D); every other Sprint 8 goal works on seeds 1-100 and 12345.

**Test-only (Sprint 7):** seven more `planToStep` goals (all work for seeds 1-100 and 12345, pass-the-phone and online; `planToStep(seed, goal, maxActions?, options?)` takes the game options, e.g. `{rezWindow: 'always'}` for an online prelude — pass the same options to the game). `SPRINT7_GOALS` lists them.
- `corp_rez_asset` — Corp's action step, a face-down PAD Campaign with Rez legal (≥ 2 credits). `info: {uid, cardId: 'c03', server, cost: '2'}`. Rez → `credits_spent 2`, `card_rezzed`; at the next Corp turn start `ability_triggered` + `credit_gained 1`.
- `runner_approach_akitaro` — a run waits on the Corp at a face-down Wall of Static protecting a server with a face-up Akitaro Watanabe; the Corp has exactly 1 credit and the Rez option costs 1 (S-07-2 AC4 + AC5). `info: {server, iceUid, akitaroUid, cost: '1', corpCredits: '1'}`.
- `runner_armitage` — Runner's action step, ≥ 1 click, Armitage Codebusting installed with 12 credits. `info: {uid, credits: '12'}`. Its `installedOptions[uid]` = `[{activate, cost 0, clicks 1, gain 2}]`.
- `runner_cyberfeeder_ice_wall` — the Runner encounters a rezzed Ice Wall (no counters) with Corroder and Cyberfeeder (1 credit on it) installed and 0 own credits. `info: {server, iceUid, breakerUid, cyberfeederUid}`. The break option has `hostedPay: [{uid: cyberfeederUid, amount: 1}]`.
- `runner_bank_job_remote` — Runner's action step, ≥ 1 click, Bank Job with 8 credits, a remote with no ICE holding a card. `info: {bankJobUid, server, credits: '8'}`. A run there stops at step `success`.
- `corp_ice_wall` — Corp's action step, ≥ 2 clicks and ≥ 3 credits, a face-down Ice Wall (no counters) alone on a remote, the Runner has Corroder and ≥ 2 credits (S-07-5 AC1 + AC2: advance twice, end turn, the Runner runs, the Corp rezzes, strength 3). `info: {uid, server, breakerUid}`.
- `remote_last_card` — Runner's action step, ≥ 1 click, ≥ 2 remotes, one with no ICE holding exactly one agenda whose steal does not win (S-07-1). `info: {server, uid, cardId, otherServer}`. Stealing it → `run_ended`, `server_removed {server}`.

**Test-only (Sprint 9):** eleven `planToStep` goals on the **core decks** (`SPRINT9_GOALS`; `plan.deckSet === 'core'`). **All work for seeds 1-100 and 12345, pass-the-phone and online (`{rezWindow: 'always'}`)**; tests pin 1, 7, 42, 12345. Hunter is always alone on a new remote and the Runner (Kate, link 1) runs only that server.
- `hunter_encounter` — the Runner encounters a rezzed Hunter, no sentry breaker (no Pipeline), link 1, Runner ≥ 4 credits, Corp ≥ 2 credits. `info: {server, iceUid, corpCredits, runnerCredits}`. Let it fire → `trace_corp` (Corp's phone); Corp bids 2 → `trace_runner` with `needed: 4`.
- `hunter_corp_broke` — the same with the Corp at **0 credits** and the Runner ≥ 2. Let it fire → `trace_bid{corp, 0, auto}` and straight to `trace_runner` (no Corp hand-off). Same `info`.
- `trace_tie` — Hunter's trace waits on the Runner's bid (`trace_runner`, in the run) with 1 ≤ `needed` ≤ his max. `info: {server, iceUid, needed, strength, link}`. Bid `needed` → escaped (tie); `needed − 1` → tagged.
- `runner_tagged_corp_turn` — Corp's action step, 3 clicks, ≥ 2 credits, Runner tagged with Armitage Codebusting installed. `info: {armitageUid, tags}`. `installedOptions[armitageUid]` = `[{trash_resource, cost 2, clicks 1}]`.
- `runner_tagged_own_turn` — Runner's action step (no run), tagged, ≥ 1 click, ≥ 2 credits. `info: {tags}`. `basicOptions` = `[{remove_tag, cost 2, clicks 1}]`.
- `psf_scored_tagged` — Corp's action step, 3 clicks, Private Security Force in the Corp score area, Runner tagged. `info: {uid: 'score:corp:<i>', grip}`; `grip` is the Runner's Grip size (never '0' on seeds 1-100/12345, so the flatline is engine-tested with fixtures).
- `ichi_two_programs` — the Runner encounters a rezzed Ichi 1.0 with ≥ 2 programs. `info: {server, iceUid, programs, construct}` (as `rototurret_two_programs`). **With Sacrificial Construct** on seeds 11, 16, 20, 27, 30, 32, 35, 42, 43, 48, 51, 54, 56, 59, 62, 65, 67, 69, 92, 95 (the same as Rototurret's); none on e.g. 1, 7, 12345.
- `sea_source_ready` — Corp's action step, 3 clicks, ≥ 3 credits, SEA Source in HQ and playable (the Runner ran Archives successfully last turn). `info: {handIndex}`.
- `sea_source_not_ready` — the same, but no successful run last turn: the play option has `reject: 'condition_not_met'`. `info: {handIndex}`.
- `globalsec_installed` / `globalsec_two_installed` — Runner's action step, ≥ 1 click, exactly 1 / 2 Access to Globalsec installed (link 2 / 3), Hunter installed on a remote the Corp can rez (or face up). `info: {uids, link, hunterServer}`. A run on `hunterServer` starts the trace with that link.
- Retired: `pipeline_katana_encounter` (throws; Neural Katana left the deck) → `pipeline_hunter_encounter` (in `SPRINT8_GOALS`).

**Test-only (Sprint 10):** ten `planToStep` goals on the **core decks** (`SPRINT10_GOALS`; `plan.deckSet === 'core'`). **All work for seeds 1-100 and 12345, pass-the-phone and online (`{rezWindow: 'always'}`)**; tests pin 1, 7, 42, 12345 (`packages/match/test/sprint10-goals.test.ts`). Bank Job keeps using the Sprint 7 goal `runner_bank_job_remote` (starter decks; a run there now lists Take 1..8, then Access cards).
- `agenda_at_requirement` — Corp's action step, ≥ 1 click, ≥ 1 credit, an installed agenda holding exactly its requirement; `installedOptions[uid]` = `[score]` only, and `advance` is refused `condition_not_met` (to the Corp's seat only). `info: {uid, server, cardId, advancements}` (seeds 1 / 12345: Priority Requisition at 5; 7 / 42: Private Security Force at 4).
- `agenda_one_short` — the same, one counter short: `installedOptions[uid]` = `[advance]`; after it, `[score]`. Same `info`.
- `ice_wall_advanced` — Corp's action step, ≥ 1 click, ≥ 1 credit, an Ice Wall with ≥ 1 counter (usually 1) and Advance legal. `info: {uid, server, advancements}`.
- `corp_two_scored` — Corp's action step, ≥ 1 click, ≥ 2 agendas scored, one of them Private Security Force (never 7 points). `info: {count, points, scored: 'c09,c10', psfUid: 'score:corp:<i>'}`. The Runner is not tagged, so PSF's option is listed with `condition_not_met`.
- `runner_two_stolen` — Runner's action step (no run), ≥ 1 click, ≥ 2 agendas stolen (under 7 points). `info: {count, points, scored}`.
- `psf_installed_unscored` — Corp's action step, ≥ 1 click, ≥ 1 credit, Private Security Force installed (not scored), < 4 counters: `installedOptions[uid]` = `[advance]` (no engine option for its scored ability). `info: {uid, server, advancements}`.
- `runner_tagged_full_rig` — Runner's action step (no run), tagged, ≥ 4 rig cards (usually exactly 4) including exactly one Access to Globalsec (link 2), got tagged by Hunter. `info: {tags, link: '2', rig, globalsecUid}`.
- `remote_single_card_no_ice` — Runner's action step, ≥ 1 click, a remote with no ICE holding one card he can take (an agenda whose steal does not win, or an asset he can afford to trash), with another remote after it. `info: {server, uid, cardId, kind: 'steal' | 'trash', otherServer}` (seeds 1, 7, 42: `remote1` with an asset to trash; 12345: an agenda to steal). Taking it → `server_removed{server}`; the other servers keep their ids and order.
- `runner_must_discard` / `corp_must_discard` — that side's discard step at the end of its first turn (drew with every click): `pendingDiscard` 4, hand 9. `info: {count, hand}`.

**Test-only (Sprint 11):** one `planToStep` goal on the **core decks** (`SPRINT11_GOALS`; `plan.deckSet === 'core'`). **Works for seeds 1-100 and 12345, pass-the-phone and online (`{rezWindow: 'always'}`)**; tests pin 1, 7, 42, 12345 (`packages/match/test/sprint11-goals.test.ts`).
- `ice_wall_ram_gordian` — the Runner encounters a rezzed Ice Wall alone on a remote (one subroutine) with **Battering Ram and Gordian Blade** installed and ≥ 3 credits, `pass` offered. `info: {server, iceUid, breakerUid (= ramUid), ramUid, gordianUid, iceStrength}`. Ram's `run.options`: one break `use_ability {uid: ramUid, ability: 0, subs: [0]}` (cost 2) and one pump (ability 1, cost 1); Gordian Blade offers no usable break. Sending the break → `credits_spent 2`, `subroutine_broken {sub: 0, breakerUid: ramUid}` on both phones.

**Test-only (Sprint 12):** nine `planToStep` goals on the **45-card decks** (`SPRINT12_GOALS`; `plan.deckSet === 'core45'`; create the page's game with the same options). Tests pin seeds per goal (`packages/match/test/sprint12-goals.test.ts`); seeds 1-40 work for the seven planned goals, pass-the-phone and online. `stepReached(goal, views, state?)`: the ABT goals need the full state (top of R&D) and skip that check without it.
- `abt_scorable` — Corp's action step, an installed Accelerated Beta Test ready to score (not winning), ≥ 1 ICE in the top 3 of R&D. `info: {uid, server, cardId: 'c23', looked, ice}`. All of 1-100 and 12345.
- `abt_scorable_no_ice` — the same with 3 cards to look at, none ICE (Done is the only option). Same `info`. Fails on 80 and 12345 (R&D runs too short).
- `archived_memories_ready` — Corp's action step, ≥ 1 click, Archived Memories playable, ≥ 1 face-down card in Archives. `info: {handIndex, archives, faceDownIndex}`. All of 1-100, 12345.
- `archived_memories_empty` (extra, for the dimmed hint) — Archived Memories in HQ, Archives empty: its option is `condition_not_met`. `info: {handIndex}`. Fails on 30, 36, 42, 71, 97.
- `experiential_data_encounter` — the Runner encounters a rezzed Enigma (strength 3) alone on a remote with a face-up Experiential Data, Gordian Blade installed, ≥ 3 credits. `info: {server, iceUid, edUid, breakerUid, iceStrength: '3', printedStrength: '2'}`. All seeds.
- `toolbox_encounter` — the Runner encounters a rezzed Ice Wall / Wall of Static alone on a remote, The Toolbox (2 credits) and a barrier breaker installed; breaker options carry `hostedPay` from The Toolbox. `info: {server, iceUid, iceCardId, toolboxUid, breakerUid}`. All seeds.
- `modded_ready` — Runner's action step, Modded in the Grip with a legal install. `info: {handIndex, installIndex, cardId, cost, discount}` (biggest discount). All seeds.
- `modded_no_target` (extra, for the dimmed hint) — Modded in the Grip, no program/hardware there. `info: {handIndex}`. Fails on 5, 32, 52, 61, 63.
- `infiltration_ready` — Runner's action step, Infiltration in the Grip, ≥ 1 face-down installed Corp card. `info: {handIndex, uid, server, cardId}` (the first Expose option; `cardId` = what exposing shows). All seeds.

The client and AI may import only the public index of engine/cards/match. The client may not import `apply`, `newGame`, `legalActions`, `viewFor` or `replay` (it goes through the match).

## Rules for contributors
- Sprint 11: any engine or card-data change that can change the result of replaying a saved action list must bump `RULES_VERSION` (saved games and live online games under the old version then show "can't continue"). The golden save fixture in `@overclock/match` (`test/saved-game.test.ts`) fails CI otherwise.
- Every new action/event is added here, to the validation table and to the sprint tech plan.
- Every action has Vitest tests for its success path and each rejection reason.
- Card behavior belongs in `@overclock/cards` data + the effect DSL, not in engine special cases.
